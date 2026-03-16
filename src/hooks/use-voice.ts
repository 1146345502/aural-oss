"use client";

import { createLogger } from "@/lib/logger";
import {
  buildRelayTargets,
  isRecoverableRelayErrorMessage,
  RelayConnector,
  relayDisplayName,
  resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import {
  JITTER_BUFFER_MAX_WAIT_MS,
  PLAYBACK_SAMPLE_RATE,
  shouldFlushPlaybackQueue,
} from "@/lib/voice/playback-jitter-buffer";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("voice");

export interface InterviewContext {
  title: string;
  objective?: string | null;
  aiName: string;
  aiTone: string;
  language: string;
  followUpDepth: string;
  startQuestionIndex?: number;
  questions: Array<{
    text: string;
    type: string;
    description?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any;
    starterCode?: { language: string; code: string } | null;
    order: number;
  }>;
}

interface UseVoiceOptions {
  interviewId: string;
  sessionId: string;
  interviewContext: InterviewContext;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
  onQuestionChange?: (index: number, total: number) => void;
  onTtsChunk?: (pcmData: ArrayBuffer) => void;
  onInterrupt?: () => void;
}

interface VoiceState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  isTransitioning: boolean;
  transitionDirection: "next" | "previous" | null;
  isSaving: boolean;
  isInterviewComplete: boolean;
  userTranscript: string;
  aiTranscript: string;
  lastAssistantUtteranceEndedAt: number;
  audioLevel: number;
  currentQuestionIndex: number;
  totalQuestions: number;
}

interface TrackedMessage {
  role: "user" | "assistant";
  content: string;
  source?: "voice" | "chat";
}

/**
 * Voice interview hook using Volcengine S2S (Speech-to-Speech) via relay.
 *
 * Flow:
 * 1. Browser connects and sends interview context to relay
 * 2. Relay builds system prompt and connects to Volcengine
 * 3. Browser captures mic audio as 16kHz int16 PCM
 * 4. Audio sent to relay server via WebSocket (hex-encoded)
 * 5. Relay forwards to Volcengine S2S which handles ASR + LLM + TTS
 * 6. TTS audio (24kHz float32 PCM) streamed back and played via AudioContext
 * 7. Per-question transitions managed by relay with LLM summarization
 * 8. On disconnect, all messages are saved to database
 */
export function useVoice({
  sessionId,
  interviewContext,
  onTranscript,
  onAIResponse,
  onError,
  onQuestionChange,
  onTtsChunk,
  onInterrupt,
}: UseVoiceOptions) {
  const [state, setState] = useState<VoiceState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    isTransitioning: false,
    transitionDirection: null,
    isSaving: false,
    isInterviewComplete: false,
    userTranscript: "",
    aiTranscript: "",
    lastAssistantUtteranceEndedAt: 0,
    audioLevel: 0,
    currentQuestionIndex: interviewContext.startQuestionIndex ?? 0,
    totalQuestions: interviewContext.questions.length,
  });

  const relayConnectorRef = useRef<RelayConnector<Record<string, unknown>> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processorRef = useRef<any>(null);
  const playTimeRef = useRef(0);
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const queuedAudioChunksRef = useRef<Float32Array[]>([]);
  const queuedAudioSamplesRef = useRef(0);
  const firstQueuedAudioAtRef = useRef<number | null>(null);
  const playbackFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isListeningRef = useRef(false);
  const trackedMessagesRef = useRef<TrackedMessage[]>([]);
  const micHoldUntilRef = useRef(0);
  const bargeInFramesRef = useRef(0);

  const BARGE_IN_RMS_THRESHOLD = 0.02;
  const BARGE_IN_FRAME_COUNT = 2;

  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => { onInterruptRef.current = onInterrupt; }, [onInterrupt]);
  const lastFinalUserTranscriptRef = useRef<{ text: string; at: number } | null>(null);

  // Buffers for accumulating streaming chunks
  const asrBufferRef = useRef<string>("");
  const chatBufferRef = useRef<string>("");
  const lastOnAIResponseRef = useRef<string>("");
  const currentQuestionIndexRef = useRef(
    interviewContext.startQuestionIndex ?? 0
  );
  const latestCodeUpdateRef = useRef<{ content: string; language: string } | null>(
    null
  );
  const latestWhiteboardUpdateRef = useRef<string | null>(null);

  useEffect(() => {
    currentQuestionIndexRef.current = state.currentQuestionIndex;
  }, [state.currentQuestionIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    stopListening();
    interruptPlayback();
    relayConnectorRef.current?.close();
    relayConnectorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      isTransitioning: false,
      transitionDirection: null,
      userTranscript: "",
      aiTranscript: "",
      lastAssistantUtteranceEndedAt: 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPlaybackFlushTimer = useCallback(() => {
    if (playbackFlushTimerRef.current) {
      clearTimeout(playbackFlushTimerRef.current);
      playbackFlushTimerRef.current = null;
    }
  }, []);

  const clearQueuedAudio = useCallback(() => {
    clearPlaybackFlushTimer();
    queuedAudioChunksRef.current = [];
    queuedAudioSamplesRef.current = 0;
    firstQueuedAudioAtRef.current = null;
  }, [clearPlaybackFlushTimer]);

  /** Stop all currently playing audio sources and notify recording mixer */
  const interruptPlayback = useCallback(() => {
    clearQueuedAudio();
    for (const source of audioSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    audioSourcesRef.current = [];
    playTimeRef.current = 0;
    micHoldUntilRef.current = performance.now() + 250;
    bargeInFramesRef.current = 0;
    setState((s) => ({ ...s, isSpeaking: false }));
    onInterruptRef.current?.();
  }, [clearQueuedAudio]);

  const scheduleQueuedAudioFlush = useCallback(
    (flushQueuedAudio: (force?: boolean) => void) => {
      if (playbackFlushTimerRef.current) return;
      const firstQueuedAt = firstQueuedAudioAtRef.current;
      const delayMs =
        typeof firstQueuedAt === "number"
          ? Math.max(0, JITTER_BUFFER_MAX_WAIT_MS - (performance.now() - firstQueuedAt))
          : JITTER_BUFFER_MAX_WAIT_MS;
      playbackFlushTimerRef.current = setTimeout(() => {
        playbackFlushTimerRef.current = null;
        flushQueuedAudio(true);
      }, delayMs);
    },
    []
  );

  const flushQueuedAudio = useCallback((force = false) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (queuedAudioSamplesRef.current === 0) return;

    const now = ctx.currentTime;
    const bufferedAheadMs = Math.max(0, (playTimeRef.current - now) * 1000);
    if (
      !force &&
      !shouldFlushPlaybackQueue({
        queuedSamples: queuedAudioSamplesRef.current,
        bufferedAheadMs,
        firstChunkQueuedAtMs: firstQueuedAudioAtRef.current,
        nowMs: performance.now(),
        sampleRate: PLAYBACK_SAMPLE_RATE,
      })
    ) {
      scheduleQueuedAudioFlush(flushQueuedAudio);
      return;
    }

    clearPlaybackFlushTimer();

    const float32 = new Float32Array(queuedAudioSamplesRef.current);
    let offset = 0;
    for (const chunk of queuedAudioChunksRef.current) {
      float32.set(chunk, offset);
      offset += chunk.length;
    }

    queuedAudioChunksRef.current = [];
    queuedAudioSamplesRef.current = 0;
    firstQueuedAudioAtRef.current = null;

    const audioBuffer = ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule playback sequentially
    const startAt = Math.max(now, playTimeRef.current);
    source.start(startAt);
    playTimeRef.current = startAt + audioBuffer.duration;
    micHoldUntilRef.current =
      performance.now() + Math.max(0, (playTimeRef.current - now) * 1000) + 250;
    bargeInFramesRef.current = 0;

    audioSourcesRef.current.push(source);
    setState((s) => ({
      ...s,
      isSpeaking: true,
      isProcessing: false,
    }));

    source.onended = () => {
      audioSourcesRef.current = audioSourcesRef.current.filter(
        (s) => s !== source
      );
      if (
        audioSourcesRef.current.length === 0 &&
        queuedAudioSamplesRef.current === 0
      ) {
        setState((s) => ({ ...s, isSpeaking: false }));
      }
    };
  }, [clearPlaybackFlushTimer, scheduleQueuedAudioFlush]);

  /** Queue incoming float32 PCM audio chunk and flush through a small jitter buffer. */
  const playAudio = useCallback(
    (pcmData: ArrayBuffer) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      const float32 = new Float32Array(pcmData);
      if (float32.length === 0) return;

      if (firstQueuedAudioAtRef.current === null) {
        firstQueuedAudioAtRef.current = performance.now();
      }
      queuedAudioChunksRef.current.push(float32);
      queuedAudioSamplesRef.current += float32.length;
      flushQueuedAudio();
    },
    [flushQueuedAudio]
  );

  const replayLatestRelayContext = useCallback(
    (connector?: RelayConnector<Record<string, unknown>> | null) => {
      const client = connector ?? relayConnectorRef.current;
      if (!client) return;

      const latestCode = latestCodeUpdateRef.current;
      if (latestCode) {
        client.sendJson({
          type: "code_update",
          content: latestCode.content,
          language: latestCode.language,
        });
      }

      const latestWhiteboard = latestWhiteboardUpdateRef.current;
      if (latestWhiteboard) {
        client.sendJson({
          type: "whiteboard_update",
          imageDataUrl: latestWhiteboard,
        });
      }
    },
    []
  );

  /** Connect to the voice relay server */
  const connect = useCallback(async () => {
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create AudioContext for playback
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      // Reset tracked messages
      trackedMessagesRef.current = [];

      relayConnectorRef.current?.close();

      const targets = buildRelayTargets({
        language: interviewContext.language,
        voiceRelayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL,
        openAiRelayUrl: process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL,
        primaryPreference: resolveRelayPrimaryPreference(
          process.env.NEXT_PUBLIC_VOICE_RELAY_PRIMARY,
        ),
        browserProtocol:
          typeof window !== "undefined" ? window.location.protocol : undefined,
        browserHost:
          typeof window !== "undefined" ? window.location.host : undefined,
      });

      const connector = new RelayConnector<Record<string, unknown>>({
        targets,
        binaryType: "arraybuffer",
        buildInitMessage: () => ({
          type: "init",
          context: {
            ...interviewContext,
            startQuestionIndex: currentQuestionIndexRef.current,
          },
        }),
        onJsonMessage: (msg) => {
          handleRelayMessage(msg);
        },
        onBinaryMessage: (data) => {
          playAudio(data);
          onTtsChunk?.(data);
        },
        onConnected: ({ target, isFailover, connector: activeConnector }) => {
          log.info(
            `${isFailover ? "Failed over to" : "Connected to"} ${relayDisplayName(
              target.kind
            )} @ ${target.url}`
          );
          if (isFailover) {
            replayLatestRelayContext(activeConnector);
          }
        },
        onFailover: ({ from, to, reason }) => {
          log.warn(
            `Relay failover: ${relayDisplayName(from.kind)} -> ${relayDisplayName(
              to.kind
            )} (${reason})`
          );
        },
        onPermanentFailure: (error) => {
          log.error("Voice relay exhausted all targets:", error.message);
          setState((s) => ({ ...s, isConnected: false }));
          onError?.(
            error.message || "Voice connection error. Is the relay server running?"
          );
        },
      });

      relayConnectorRef.current = connector;
      await connector.connect();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Voice connection failed";
      onError?.(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError, playAudio, interviewContext]);

  /** Extract text from a Volcengine event payload, trying common field names */
  const extractText = useCallback(
    (data: Record<string, unknown> | undefined): string => {
      if (!data) return "";
      for (const key of ["text", "content", "sentence", "delta"]) {
        if (typeof data[key] === "string" && data[key]) return data[key] as string;
      }
      return "";
    },
    []
  );

  /** Save accumulated messages to the server (incremental, non-completing).
   *  Called on each question transition so progress is not lost. */
  const saveProgress = useCallback(
    async (currentQuestionIndex: number) => {
      // Flush any remaining ASR buffer (chatBuffer is already cleared
      // before this is called by the question_change handler).
      const pendingAsrText = asrBufferRef.current.trim();
      if (pendingAsrText) {
        trackedMessagesRef.current.push({ role: "user", content: pendingAsrText });
        asrBufferRef.current = "";
      }

      const messages = [...trackedMessagesRef.current];
      trackedMessagesRef.current = []; // clear so next question starts fresh

      if (messages.length === 0 && typeof currentQuestionIndex !== "number") return;

      try {
        await fetch("/api/voice/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, messages, currentQuestionIndex }),
        });
        log.info(
          `Progress saved: ${messages.length} msgs, Q${currentQuestionIndex + 1}`
        );
      } catch (err) {
        log.error("Failed to save progress:", err);
      }
    },
    [sessionId]
  );

  /** Handle JSON messages from relay */
  const handleRelayMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msg: Record<string, any>) => {
      switch (msg.type) {
        case "ready":
          log.info("Session ready:", msg.sessionId);
          setState((s) => ({ ...s, isConnected: true }));
          break;

        case "interrupt":
          interruptPlayback();
          setState((s) => ({ ...s, isProcessing: false }));
          if (chatBufferRef.current.trim()) {
            const text = chatBufferRef.current.trim();
            setState((s) => ({ ...s, aiTranscript: text }));
            chatBufferRef.current = "";
          }
          break;

        case "asr": {
          // ASR transcript chunk from Volcengine — accumulate.
          const results =
            (msg.data?.results as Array<Record<string, unknown>>) || [];
          if (results.length > 0) {
            const text = (results[0].text as string) || "";
            if (text.trim()) {
              asrBufferRef.current = text.trim();
              setState((s) => ({ ...s, userTranscript: text }));
              onTranscript?.(text, false);
            }
          }
          break;
        }

        case "asr_ended": {
          const finalText =
            (typeof msg.text === "string" && msg.text.trim()) || asrBufferRef.current;
          if (finalText) {
            const normalized = finalText.replace(/\s+/g, " ").trim().toLowerCase();
            const lastFinal = lastFinalUserTranscriptRef.current;
            const isDuplicateFinal =
              !!lastFinal &&
              lastFinal.text === normalized &&
              Date.now() - lastFinal.at < 15_000;

            if (isDuplicateFinal) {
              log.debug(`Skipping duplicate USER final: "${normalized.slice(0, 60)}..."`);
            } else {
              lastFinalUserTranscriptRef.current = { text: normalized, at: Date.now() };
              onTranscript?.(finalText, true);
              trackedMessagesRef.current.push({
                role: "user",
                content: finalText,
              });
              log.debug(
                `Tracked USER: "${finalText.slice(0, 60)}..."`
              );
            }
          }
          asrBufferRef.current = "";
          setState((s) => ({
            ...s,
            userTranscript: "",
            isProcessing: !!finalText,
          }));
          break;
        }

        case "chat": {
          const text = extractText(msg.data);
          if (text) {
            chatBufferRef.current += text;
            setState((s) => ({
              ...s,
              aiTranscript: chatBufferRef.current,
              lastAssistantUtteranceEndedAt: 0,
              isProcessing: false,
            }));
          }
          break;
        }

        case "tts_text": {
          const text = extractText(msg.data);
          if (text) {
            chatBufferRef.current += (chatBufferRef.current ? " " : "") + text;
            setState((s) => ({
              ...s,
              aiTranscript: chatBufferRef.current,
              lastAssistantUtteranceEndedAt: 0,
              isProcessing: false,
            }));
            log.debug(
              `TTS sentence: "${text.slice(0, 80)}..."`
            );
          }
          break;
        }

        case "tts_sentence_end":
          break;

        case "chat_ended":
        case "tts_ended": {
          const fullResponse = chatBufferRef.current.trim();
          chatBufferRef.current = "";
          // Keep last transcript visible until next AI speech (replaced by tts_text/chat)
          setState((s) => ({
            ...s,
            aiTranscript: fullResponse,
            lastAssistantUtteranceEndedAt:
              msg.type === "tts_ended" ? Date.now() : s.lastAssistantUtteranceEndedAt,
            isProcessing: false,
          }));
          if (fullResponse) {
            // Dedupe: chat_ended and tts_ended often both fire for same response.
            // Use dedicated ref — trackedMessagesRef can lag; normalize for comparison.
            const normalized = fullResponse.replace(/\s+/g, " ").trim();
            const lastSent = lastOnAIResponseRef.current.replace(/\s+/g, " ").trim();
            if (normalized === lastSent) {
              log.debug(`Skipping duplicate ASSISTANT (${msg.type})`);
            } else {
              lastOnAIResponseRef.current = fullResponse;
              onAIResponse?.(fullResponse);
              trackedMessagesRef.current.push({
                role: "assistant",
                content: fullResponse,
              });
              log.debug(
                `Tracked ASSISTANT (${msg.type}): "${fullResponse.slice(0, 60)}..."`
              );
            }
          }
          break;
        }

        case "session_reconnecting":
          interruptPlayback();
          if (chatBufferRef.current.trim()) {
            const text = chatBufferRef.current.trim();
            lastOnAIResponseRef.current = text;
            onAIResponse?.(text);
            trackedMessagesRef.current.push({
              role: "assistant",
              content: text,
            });
          }
          chatBufferRef.current = "";
          lastOnAIResponseRef.current = "";
          setState((s) => ({ ...s, aiTranscript: "", isProcessing: true }));
          break;

        case "session_reconnected":
          setState((s) => ({ ...s, isProcessing: false }));
          break;

        case "question_change": {
          // For manual transitions, interrupt immediately so old audio
          // doesn't bleed into the new question. For auto-transitions
          // the wrap-up acknowledgement ("好的，谢谢分享") may still be
          // playing — let it finish naturally; the new question's audio
          // will be queued after it via sequential scheduling.
          if (!msg.auto) {
            interruptPlayback();
          }
          // Discard transition greeting text before saving progress
          chatBufferRef.current = "";
          lastOnAIResponseRef.current = "";
          const idx = msg.questionIndex as number;
          const total = msg.totalQuestions as number;

          // Persist messages from the previous question (fire-and-forget)
          saveProgress(idx);

          setState((s) => ({
            ...s,
            currentQuestionIndex: idx,
            totalQuestions: total,
              isTransitioning: false,
              transitionDirection: null,
              aiTranscript: "",
              lastAssistantUtteranceEndedAt: 0,
            }));
          onQuestionChange?.(idx, total);
          log.info(`Question ${idx + 1}/${total}`);
          break;
        }

        case "transitioning": {
          const dir = (msg.direction as "next" | "previous") ?? "next";
          if (!msg.auto) {
            interruptPlayback();
            chatBufferRef.current = "";
            setState((s) => ({
              ...s,
              isTransitioning: true,
              transitionDirection: dir,
              isSpeaking: false,
              aiTranscript: "",
              lastAssistantUtteranceEndedAt: 0,
            }));
          } else {
            setState((s) => ({
              ...s,
              isTransitioning: true,
              transitionDirection: dir,
            }));
          }
          break;
        }

        case "interview_complete":
          log.info("Interview complete, wrapping up");
          setState((s) => ({ ...s, isInterviewComplete: true }));
          break;

        case "error": {
          const message = (msg.message as string) || "Relay error";
          if (
            isRecoverableRelayErrorMessage(message) &&
            relayConnectorRef.current?.canFailover
          ) {
            log.warn(`Recoverable relay error ignored during failover window: ${message}`);
            break;
          }
          onError?.(message);
          break;
        }

        case "disconnected":
          setState((s) => ({ ...s, isConnected: false }));
          if (relayConnectorRef.current?.canFailover) {
            void relayConnectorRef.current.failover("relay disconnected message");
          }
          break;
      }
    },
    [interruptPlayback, extractText, onTranscript, onAIResponse, onError, onQuestionChange, saveProgress]
  );

  /** Start capturing microphone audio and sending to relay */
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (event) => {
        if (!isListeningRef.current) return;
        const connector = relayConnectorRef.current;
        if (!connector?.isReady) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Compute RMS audio level (float32 range 0..1)
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) sumSq += inputData[i] * inputData[i];
        const rms = Math.sqrt(sumSq / inputData.length);
        const level = Math.min(1, rms * 5);
        setState((s) => ({ ...s, audioLevel: level }));

        if (performance.now() < micHoldUntilRef.current) {
          if (rms < BARGE_IN_RMS_THRESHOLD) {
            bargeInFramesRef.current = 0;
            return;
          }

          bargeInFramesRef.current += 1;
          if (bargeInFramesRef.current < BARGE_IN_FRAME_COUNT) {
            return;
          }

          // Sustained near-field speech should still be able to interrupt TTS.
          micHoldUntilRef.current = 0;
        } else {
          bargeInFramesRef.current = 0;
        }

        // Convert float32 to int16 PCM
        const pcm = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Send as hex-encoded string
        const bytes = new Uint8Array(pcm.buffer);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, "0");
        }

        connector.sendJson({ type: "audio", data: hex });
      };

      processorRef.current = { processor, source, ctx };
      isListeningRef.current = true;
      setState((s) => ({ ...s, isListening: true, userTranscript: "" }));
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Microphone access failed";
      onError?.(msg);
    }
  }, [onError]);

  /** Stop capturing microphone */
  const stopListening = useCallback(() => {
    isListeningRef.current = false;

    if (processorRef.current) {
      const { processor, source, ctx } = processorRef.current;
      processor.disconnect();
      source.disconnect();
      ctx.close();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setState((s) => ({ ...s, isListening: false, audioLevel: 0 }));
  }, []);

  /** Request transition to the next question */
  const nextQuestion = useCallback(() => {
    relayConnectorRef.current?.sendJson({ type: "next_question" });
  }, []);

  /** Request transition back to the previous question */
  const previousQuestion = useCallback(() => {
    relayConnectorRef.current?.sendJson({ type: "prev_question" });
  }, []);

  /** Send a text message through the relay (treated like a voice utterance).
   *  The caller is responsible for adding the message to the UI display;
   *  this method only tracks it for server persistence and sends it to the relay. */
  const sendTextMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const connector = relayConnectorRef.current;
      if (!connector?.isReady) return;

      trackedMessagesRef.current.push({ role: "user", content: trimmed, source: "chat" });
      connector.sendJson({ type: "text_input", content: trimmed });
    },
    [],
  );

  /** Send code editor content to the relay for agent context */
  const sendCodeUpdate = useCallback((content: string, language: string) => {
    latestCodeUpdateRef.current = { content, language };
    relayConnectorRef.current?.sendJson({ type: "code_update", content, language });
  }, []);

  /** Send whiteboard image to the relay for agent context */
  const sendWhiteboardUpdate = useCallback((imageDataUrl: string) => {
    latestWhiteboardUpdateRef.current = imageDataUrl;
    relayConnectorRef.current?.sendJson({ type: "whiteboard_update", imageDataUrl });
  }, []);

  /** Save remaining tracked messages and complete the session */
  const saveAndComplete = useCallback(async () => {
    // Flush any pending buffers before saving
    const pendingAsrText = asrBufferRef.current.trim();
    if (pendingAsrText) {
      trackedMessagesRef.current.push({ role: "user", content: pendingAsrText });
      asrBufferRef.current = "";
    }
    const pendingChatText = chatBufferRef.current.trim();
    if (pendingChatText) {
      trackedMessagesRef.current.push({
        role: "assistant",
        content: pendingChatText,
      });
      chatBufferRef.current = "";
    }

    const messages = trackedMessagesRef.current;
    if (messages.length === 0 && !sessionId) return;

    log.info(
      `Saving ${messages.length} remaining messages and completing session`
    );

    try {
      await fetch("/api/voice/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messages,
          complete: true,
        }),
      });
    } catch (err) {
      log.error("Failed to save voice data:", err);
    }
  }, [sessionId]);

  /** Disconnect, save messages, and clean up everything */
  const disconnect = useCallback(async () => {
    setState((s) => ({ ...s, isSaving: true }));
    try {
      await saveAndComplete();
    } finally {
      cleanup();
      // isSaving is reset by cleanup
    }
  }, [saveAndComplete, cleanup]);

  return {
    ...state,
    connect,
    disconnect,
    startListening,
    stopListening,
    nextQuestion,
    previousQuestion,
    sendTextMessage,
    sendCodeUpdate,
    sendWhiteboardUpdate,
    interruptPlayback,
    mediaStreamRef,
  };
}
