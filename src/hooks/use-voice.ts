"use client";

import { createLogger } from "@/lib/logger";
import { cleanPeriodArtifacts, mergeAsrFinal, mergeClientAsrInterim, trimCrossTurnOverlap } from "@/lib/voice/asr-interim";
import { createMicFrameChunker, encodeMicAudioChunk } from "@/lib/voice/mic-audio";
import {
  JITTER_BUFFER_MAX_WAIT_MS,
  PLAYBACK_SAMPLE_RATE,
  shouldAcknowledgePlayback,
  shouldFlushPlaybackQueue,
} from "@/lib/voice/playback-jitter-buffer";
import {
  buildRelayTargets,
  isRecoverableRelayErrorMessage,
  RelayConnector,
  relayDisplayName,
  resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import { shouldCommitTranscript } from "@/lib/voice/transcript-commit";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("voice");
const USER_RESPONSE_WATCHDOG_MS = 8_000;
const ASR_INTERIM_STALE_MS = 12_000;
/** How long the mic must be quiet before speech is treated as possibly finished. */
const ASR_INTERIM_ACTIVE_SPEECH_HOLD_MS = 800;
/**
 * Floor for the "Thinking" indicator, for the rare case the relay reports a commit that is already
 * due. Otherwise the relay's own countdown decides, so the label tracks the real turn boundary.
 */
const ASR_PROCESSING_INDICATOR_MIN_DELAY_MS = 250;
const ASR_INTERIM_AUDIO_ACTIVITY_RMS_THRESHOLD = 0.018;

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
  onWhiteboardSnapshotRequest?: () => string | null | Promise<string | null>;
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
  timeLimitExceeded: boolean;
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
 * 6. TTS audio (24kHz int16 PCM) streamed back and played via AudioContext
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
  onWhiteboardSnapshotRequest,
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
    timeLimitExceeded: false,
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
  const dropAudioUntilQuestionChangeRef = useRef(false);
  const playbackFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isListeningRef = useRef(false);
  const trackedMessagesRef = useRef<TrackedMessage[]>([]);
  const savedMessageCountRef = useRef(0);
  const flushingPromiseRef = useRef<Promise<void> | null>(null);
  const micHoldUntilRef = useRef(0);
  const bargeInFramesRef = useRef(0);

  const BARGE_IN_RMS_THRESHOLD = 0.048;
  const BARGE_IN_FRAME_COUNT = 4;

  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => { onInterruptRef.current = onInterrupt; }, [onInterrupt]);
  const onWhiteboardSnapshotRequestRef = useRef(onWhiteboardSnapshotRequest);
  useEffect(() => {
    onWhiteboardSnapshotRequestRef.current = onWhiteboardSnapshotRequest;
  }, [onWhiteboardSnapshotRequest]);
  const onAIResponseRef = useRef(onAIResponse);
  useEffect(() => { onAIResponseRef.current = onAIResponse; }, [onAIResponse]);
  const lastFinalUserTranscriptRef = useRef<{ text: string; at: number } | null>(null);
  const lastSentChatInputRef = useRef<{ text: string; at: number } | null>(null);

  // Buffers for accumulating streaming chunks
  const asrBufferRef = useRef<string>("");
  const lastMicActivityAtRef = useRef(0);
  const chatBufferRef = useRef<string>("");
  const lastOnAIResponseRef = useRef<string>("");
  /** Bumped on every interruptPlayback — stale assistant TTS must not commit to transcript. */
  const playbackCommitSessionRef = useRef(0);
  /** Set from relay tts_ended / chat_ended; committed only when audio queue finishes without interrupt. */
  const pendingAssistantPlaybackCommitRef = useRef<{
    text: string;
    session: number;
    utteranceId?: string;
  } | null>(null);
  /** Relay `playbackCommitSessionRef` at the start of the current TTS utterance (first text or audio chunk). */
  const ttsUtteranceStartSessionRef = useRef(0);
  const currentQuestionIndexRef = useRef(
    interviewContext.startQuestionIndex ?? 0
  );
  const totalQuestionsRef = useRef(interviewContext.questions.length);
  const latestCodeUpdateRef = useRef<{ content: string; language: string } | null>(
    null
  );
  const latestWhiteboardUpdateRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asrInterimWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asrProcessingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentQuestionIndexRef.current = state.currentQuestionIndex;
  }, [state.currentQuestionIndex]);

  useEffect(() => {
    totalQuestionsRef.current = state.totalQuestions;
  }, [state.totalQuestions]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearResponseWatchdog = useCallback(() => {
    if (responseWatchdogRef.current) {
      clearTimeout(responseWatchdogRef.current);
      responseWatchdogRef.current = null;
    }
  }, []);

  const clearAsrInterimWatchdog = useCallback(() => {
    if (asrInterimWatchdogRef.current) {
      clearTimeout(asrInterimWatchdogRef.current);
      asrInterimWatchdogRef.current = null;
    }
  }, []);

  const clearAsrProcessingTimer = useCallback(() => {
    if (asrProcessingTimerRef.current) {
      clearTimeout(asrProcessingTimerRef.current);
      asrProcessingTimerRef.current = null;
    }
  }, []);

  /**
   * Reveal "Thinking" only once the utterance is actually finished, using the relay's countdown to
   * its own turn commit (`asr_pending.delayMs`). Guessing locally — a fixed hold after the mic went
   * quiet — surfaced the label during ordinary mid-sentence pauses, seconds before the relay had
   * decided anything, then hid it again when speech resumed.
   */
  const startAsrProcessingTimer = useCallback(
    (pendingText: string, commitInMs: number) => {
      clearAsrProcessingTimer();
      const trimmed = pendingText.trim();
      if (!trimmed) return;

      const revealIndicator = () => {
        asrProcessingTimerRef.current = null;
        const current = stateRef.current;
        if (!current.isConnected || current.isSpeaking || current.isTransitioning) return;

        // Audible again: the relay will extend its window, so keep the caption as live text.
        if (
          performance.now() - lastMicActivityAtRef.current <
          ASR_INTERIM_ACTIVE_SPEECH_HOLD_MS
        ) {
          asrProcessingTimerRef.current = setTimeout(
            revealIndicator,
            ASR_INTERIM_ACTIVE_SPEECH_HOLD_MS,
          );
          return;
        }

        setState((s) => ({
          ...s,
          aiTranscript: "",
          isProcessing: true,
        }));
      };

      asrProcessingTimerRef.current = setTimeout(
        revealIndicator,
        Math.max(ASR_PROCESSING_INDICATOR_MIN_DELAY_MS, commitInMs),
      );
    },
    [clearAsrProcessingTimer],
  );

  const startResponseWatchdog = useCallback(
    (finalText: string) => {
      clearResponseWatchdog();
      const trimmed = finalText.trim();
      if (!trimmed) return;

      responseWatchdogRef.current = setTimeout(() => {
        responseWatchdogRef.current = null;
        const current = stateRef.current;
        if (
          !current.isConnected ||
          !current.isProcessing ||
          current.isSpeaking ||
          current.isTransitioning
        ) {
          return;
        }

        const connector = relayConnectorRef.current;
        if (!connector?.isReady) {
          setState((s) => ({ ...s, isProcessing: false }));
          return;
        }

        log.warn(
          `No relay response after final user transcript; retrying once: "${trimmed.slice(0, 80)}..."`,
        );
        connector.sendJson({
          type: "text_input",
          content: trimmed,
          replay: true,
        });
        setState((s) => ({ ...s, isProcessing: false }));
      }, USER_RESPONSE_WATCHDOG_MS);
    },
    [clearResponseWatchdog],
  );

  const startAsrInterimWatchdog = useCallback(
    (interimText: string) => {
      clearAsrInterimWatchdog();
      const trimmed = interimText.trim();
      if (!trimmed) return;

      asrInterimWatchdogRef.current = setTimeout(() => {
        asrInterimWatchdogRef.current = null;
        const pending = asrBufferRef.current.trim();
        const current = stateRef.current;
        if (
          !pending ||
          !current.isConnected ||
          current.isSpeaking ||
          current.isTransitioning
        ) {
          return;
        }

        if (
          performance.now() - lastMicActivityAtRef.current <
          ASR_INTERIM_ACTIVE_SPEECH_HOLD_MS
        ) {
          startAsrInterimWatchdog(pending);
          return;
        }

        const connector = relayConnectorRef.current;
        if (!connector?.isReady) {
          setState((s) => ({ ...s, userTranscript: "" }));
          return;
        }

        log.warn(
          `ASR interim did not finalize; promoting once: "${pending.slice(0, 80)}..."`,
        );
        asrBufferRef.current = "";
        connector.sendJson({
          type: "text_input",
          content: pending,
          replay: true,
          source: "asr_interim_watchdog",
        });
        setState((s) => ({
          ...s,
          userTranscript: "",
          isProcessing: true,
        }));
        startResponseWatchdog(pending);
      }, ASR_INTERIM_STALE_MS);
    },
    [clearAsrInterimWatchdog, startResponseWatchdog],
  );

  const cleanup = useCallback(() => {
    clearResponseWatchdog();
    clearAsrInterimWatchdog();
    clearAsrProcessingTimer();
    stopListening();
    interruptPlayback();
    relayConnectorRef.current?.close();
    relayConnectorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    dropAudioUntilQuestionChangeRef.current = false;
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
  }, [clearAsrInterimWatchdog, clearAsrProcessingTimer, clearResponseWatchdog]);

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

  const commitAssistantTranscript = useCallback((text: string, reason: string) => {
    const trimmed = text.trim();
    if (!shouldCommitTranscript(lastOnAIResponseRef.current, trimmed)) {
      if (trimmed) log.debug(`Skipping duplicate ASSISTANT (${reason})`);
      return false;
    }

    lastOnAIResponseRef.current = trimmed;
    onAIResponseRef.current?.(trimmed);
    trackedMessagesRef.current.push({
      role: "assistant",
      content: trimmed,
    });
    log.debug(`Tracked ASSISTANT (${reason}): "${trimmed.slice(0, 60)}..."`);
    return true;
  }, []);

  /** Stop all currently playing audio sources and notify recording mixer */
  const interruptPlayback = useCallback(() => {
    playbackCommitSessionRef.current += 1;
    pendingAssistantPlaybackCommitRef.current = null;
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

  /** Commit assistant to saved transcript only after audio finished (avoids phantom lines on barge-in). */
  const tryCommitAssistantPlayback = useCallback(() => {
    const pending = pendingAssistantPlaybackCommitRef.current;
    if (!pending) return;
    if (pending.session !== playbackCommitSessionRef.current) {
      pendingAssistantPlaybackCommitRef.current = null;
      return;
    }
    if (!shouldAcknowledgePlayback({
      pendingSession: pending.session,
      currentSession: playbackCommitSessionRef.current,
      activeSourceCount: audioSourcesRef.current.length,
      queuedSamples: queuedAudioSamplesRef.current,
    })) {
      return;
    }
    const text = pending.text.trim();
    pendingAssistantPlaybackCommitRef.current = null;

    const committed = text
      ? commitAssistantTranscript(text, "after playback")
      : false;
    if (committed) {
      setState((s) => ({
        ...s,
        lastAssistantUtteranceEndedAt: Date.now(),
      }));
    }

    if (pending.utteranceId && relayConnectorRef.current?.isReady) {
      relayConnectorRef.current.sendJson({
        type: "playback_ended",
        utteranceId: pending.utteranceId,
      });
    }
  }, [commitAssistantTranscript]);

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
      isTransitioning: false,
      transitionDirection: null,
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
        tryCommitAssistantPlayback();
      }
    };
  }, [clearPlaybackFlushTimer, scheduleQueuedAudioFlush, tryCommitAssistantPlayback]);

  /** Queue incoming int16 PCM audio chunk, convert to float32, and flush
   *  through a small jitter buffer. */
  const playAudio = useCallback(
    (pcmData: ArrayBuffer) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      const int16 = new Int16Array(pcmData);
      if (int16.length === 0) return;
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }
      if (float32.length === 0) return;

      if (firstQueuedAudioAtRef.current === null) {
        firstQueuedAudioAtRef.current = performance.now();
        ttsUtteranceStartSessionRef.current = playbackCommitSessionRef.current;
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
      savedMessageCountRef.current = 0;
      pendingAssistantPlaybackCommitRef.current = null;
      playbackCommitSessionRef.current = 0;

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
        reconnectAttempts: 2,
        reconnectDelayMs: 1500,
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
          if (dropAudioUntilQuestionChangeRef.current) return;
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
        onReconnecting: (attempt, maxAttempts, target) => {
          log.info(
            `Reconnecting to ${relayDisplayName(target.kind)} (attempt ${attempt}/${maxAttempts})...`
          );
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
      if (flushingPromiseRef.current) {
        await flushingPromiseRef.current;
      }

      // Flush any remaining ASR buffer (chatBuffer is already cleared
      // before this is called by the question_change handler).
      const pendingAsrText = asrBufferRef.current.trim();
      if (pendingAsrText) {
        trackedMessagesRef.current.push({ role: "user", content: pendingAsrText });
        asrBufferRef.current = "";
      }

      const start = savedMessageCountRef.current;
      const unsaved = trackedMessagesRef.current.slice(start);
      trackedMessagesRef.current = [];
      savedMessageCountRef.current = 0;

      if (unsaved.length === 0 && typeof currentQuestionIndex !== "number") return;

      try {
        const res = await fetch("/api/voice/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, messages: unsaved, currentQuestionIndex }),
        });
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "TIME_LIMIT_EXCEEDED") {
            setState((s) => ({ ...s, timeLimitExceeded: true }));
            return;
          }
        }
        log.info(
          `Progress saved: ${unsaved.length} msgs, Q${currentQuestionIndex + 1}`
        );
      } catch (err) {
        log.error("Failed to save progress:", err);
      }
    },
    [sessionId]
  );

  /** Periodically flush unsaved tracked messages to the server. */
  const flushTrackedMessages = useCallback(async () => {
    const currentMessages = trackedMessagesRef.current;
    const start = savedMessageCountRef.current;
    if (start >= currentMessages.length) return;

    const unsaved = currentMessages.slice(start);

    const promise = (async () => {
      try {
        const res = await fetch("/api/voice/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, messages: unsaved }),
        });
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "TIME_LIMIT_EXCEEDED") {
            setState((s) => ({ ...s, timeLimitExceeded: true }));
            return;
          }
        }
        if (trackedMessagesRef.current === currentMessages) {
          savedMessageCountRef.current = currentMessages.length;
        }
        log.info(`Periodic flush: ${unsaved.length} messages saved`);
      } catch (err) {
        log.error("Failed to flush messages:", err);
      } finally {
        flushingPromiseRef.current = null;
      }
    })();

    flushingPromiseRef.current = promise;
    await promise;
  }, [sessionId]);

  useEffect(() => {
    if (!state.isConnected) return;
    const timer = setInterval(flushTrackedMessages, 10_000);
    return () => clearInterval(timer);
  }, [state.isConnected, flushTrackedMessages]);

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
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          interruptPlayback();
          chatBufferRef.current = "";
          setState((s) => ({
            ...s,
            aiTranscript: "",
          }));
          break;

        case "whiteboard_snapshot_request": {
          const requestId =
            typeof msg.requestId === "string" ? (msg.requestId as string) : "";
          const connector = relayConnectorRef.current;
          void Promise.resolve(onWhiteboardSnapshotRequestRef.current?.())
            .then((imageDataUrl) => {
              if (!connector?.isReady) return;
              if (imageDataUrl) {
                latestWhiteboardUpdateRef.current = imageDataUrl;
                connector.sendJson({
                  type: "whiteboard_update",
                  imageDataUrl,
                  requestId,
                });
              } else {
                connector.sendJson({
                  type: "whiteboard_snapshot_unavailable",
                  requestId,
                });
              }
            })
            .catch((error) => {
              log.warn("Failed to export whiteboard snapshot:", error);
              connector?.sendJson({
                type: "whiteboard_snapshot_unavailable",
                requestId,
              });
            });
          break;
        }

        case "asr": {
          // ASR transcript chunk from Volcengine — accumulate.
          const results =
            (msg.data?.results as Array<Record<string, unknown>>) || [];
          if (results.length > 0) {
            const text = (results[0].text as string) || "";
            if (text.trim()) {
              clearAsrProcessingTimer();
              const merged = mergeClientAsrInterim(asrBufferRef.current, text);
              asrBufferRef.current = merged;
              startAsrInterimWatchdog(merged);
              const cleaned = cleanPeriodArtifacts(merged);
              const display = cleaned.replace(/\s+$/, "").replace(/[.!?。！？]+$/, "");
              setState((s) => ({ ...s, isProcessing: false, userTranscript: display }));
              onTranscript?.(display, false);
            }
          }
          break;
        }

        case "asr_pending": {
          const text =
            typeof msg.text === "string" && msg.text.trim()
              ? msg.text.trim()
              : asrBufferRef.current;
          if (text.trim()) {
            const merged = mergeClientAsrInterim(asrBufferRef.current, text);
            asrBufferRef.current = merged;
            // The relay reports how long it will hold the turn open; mirror that countdown so the
            // indicator appears when the turn is actually committed, not during a pause.
            const commitInMs =
              typeof msg.delayMs === "number" && Number.isFinite(msg.delayMs)
                ? msg.delayMs
                : ASR_INTERIM_ACTIVE_SPEECH_HOLD_MS;
            startAsrProcessingTimer(merged, commitInMs);
            if (!stateRef.current.isProcessing) {
              const cleaned = cleanPeriodArtifacts(merged);
              const display = cleaned.replace(/\s+$/, "").replace(/[.!?。！？]+$/, "");
              setState((s) => ({ ...s, userTranscript: display }));
              onTranscript?.(display, false);
            }
          }
          break;
        }

        case "asr_cancelled":
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          asrBufferRef.current = "";
          setState((s) => ({
            ...s,
            userTranscript: "",
            isProcessing: false,
          }));
          break;

        case "asr_ended": {
          clearAsrProcessingTimer();
          clearAsrInterimWatchdog();
          const pendingAssistantStream = chatBufferRef.current.trim();
          if (pendingAssistantStream) chatBufferRef.current = "";
          const finalFromRelay =
            typeof msg.text === "string" ? msg.text.trim() : "";
          let finalText = cleanPeriodArtifacts(
            finalFromRelay
              ? mergeAsrFinal(asrBufferRef.current, finalFromRelay)
              : asrBufferRef.current,
          );
          const lastTrackedUser = [...trackedMessagesRef.current]
            .reverse()
            .find((m) => m.role === "user");
          if (lastTrackedUser?.content && finalText) {
            finalText = trimCrossTurnOverlap(lastTrackedUser.content, finalText);
          }
          const finalSource = typeof msg.source === "string" ? msg.source : "";
          let duplicateSkipped = false;
          if (finalText) {
            const normalized = finalText.replace(/\s+/g, " ").trim().toLowerCase();
            const lastFinal = lastFinalUserTranscriptRef.current;
            const lastChat = lastSentChatInputRef.current;
            const isChatEcho =
              finalSource === "chat" ||
              Boolean(
                lastChat &&
                  lastChat.text === normalized &&
                  Date.now() - lastChat.at < 15_000,
              );
            const isDuplicateFinal =
              !!lastFinal &&
              lastFinal.text === normalized &&
              Date.now() - lastFinal.at < 15_000;

            if (isDuplicateFinal) {
              duplicateSkipped = true;
              log.debug(`Skipping duplicate USER final: "${normalized.slice(0, 60)}..."`);
            } else if (isChatEcho) {
              startResponseWatchdog(finalText);
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
              startResponseWatchdog(finalText);
            }
          }
          asrBufferRef.current = "";
          setState((s) => ({
            ...s,
            userTranscript: (finalText && !duplicateSkipped) ? finalText : "",
            aiTranscript: pendingAssistantStream ? "" : s.aiTranscript,
            isProcessing: Boolean(finalText) && !duplicateSkipped,
          }));
          break;
        }

        case "response_started":
          clearAsrProcessingTimer();
          clearResponseWatchdog();
          setState((s) => ({ ...s, userTranscript: "", aiTranscript: "", isProcessing: true }));
          break;

        case "chat": {
          const text = extractText(msg.data);
          if (text) {
            clearResponseWatchdog();
            clearAsrInterimWatchdog();
            clearAsrProcessingTimer();
            const wasEmpty = !chatBufferRef.current.trim();
            chatBufferRef.current += text;
            if (wasEmpty) {
              ttsUtteranceStartSessionRef.current = playbackCommitSessionRef.current;
            }
            setState((s) => ({
              ...s,
              userTranscript: "",
              aiTranscript: chatBufferRef.current,
              lastAssistantUtteranceEndedAt: 0,
            }));
          }
          break;
        }

        case "tts_text": {
          const text = extractText(msg.data);
          if (text) {
            clearResponseWatchdog();
            clearAsrInterimWatchdog();
            clearAsrProcessingTimer();
            const wasEmpty = !chatBufferRef.current.trim();
            chatBufferRef.current += (chatBufferRef.current ? " " : "") + text;
            if (wasEmpty) {
              ttsUtteranceStartSessionRef.current = playbackCommitSessionRef.current;
            }
            setState((s) => ({
              ...s,
              userTranscript: "",
              aiTranscript: chatBufferRef.current,
              lastAssistantUtteranceEndedAt: 0,
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
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          const fullResponse = chatBufferRef.current.trim();
          chatBufferRef.current = "";
          const utteranceId =
            typeof msg.utteranceId === "string"
              ? (msg.utteranceId as string)
              : undefined;
          const hasAudioPending =
            queuedAudioSamplesRef.current > 0 ||
            audioSourcesRef.current.length > 0;
          setState((s) => ({
            ...s,
            aiTranscript: fullResponse,
            lastAssistantUtteranceEndedAt: s.lastAssistantUtteranceEndedAt,
            isProcessing: hasAudioPending ? s.isProcessing : false,
            isTransitioning: false,
            transitionDirection: null,
          }));
          if (fullResponse || utteranceId) {
            pendingAssistantPlaybackCommitRef.current = {
              text: fullResponse,
              session: ttsUtteranceStartSessionRef.current,
              utteranceId,
            };
          }
          tryCommitAssistantPlayback();
          break;
        }

        case "session_reconnecting":
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          interruptPlayback();
          dropAudioUntilQuestionChangeRef.current = false;
          chatBufferRef.current = "";
          lastOnAIResponseRef.current = "";
          setState((s) => ({ ...s, aiTranscript: "", isProcessing: true }));
          break;

        case "session_reconnected":
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          setState((s) => ({ ...s, isProcessing: false }));
          break;

        case "question_change": {
          // For manual transitions, interrupt immediately so old audio
          // doesn't bleed into the new question. For auto-transitions
          // the wrap-up acknowledgement ("好的，谢谢分享") may still be
          // playing — let it finish naturally; the new question's audio
          // will be queued after it via sequential scheduling.
          if (!msg.auto) {
            clearResponseWatchdog();
            clearAsrInterimWatchdog();
            clearAsrProcessingTimer();
            interruptPlayback();
          }
          dropAudioUntilQuestionChangeRef.current = false;
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

        case "transition_cancelled": {
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          dropAudioUntilQuestionChangeRef.current = false;
          setState((s) => ({
            ...s,
            currentQuestionIndex:
              typeof msg.questionIndex === "number"
                ? (msg.questionIndex as number)
                : s.currentQuestionIndex,
            totalQuestions:
              typeof msg.totalQuestions === "number"
                ? (msg.totalQuestions as number)
                : s.totalQuestions,
            isTransitioning: false,
            transitionDirection: null,
            isSpeaking: false,
            isProcessing: false,
          }));
          break;
        }

        case "interview_complete":
          log.info("Interview complete, wrapping up");
          setState((s) => ({ ...s, isInterviewComplete: true }));
          break;

        case "error": {
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          dropAudioUntilQuestionChangeRef.current = false;
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
          clearResponseWatchdog();
          clearAsrInterimWatchdog();
          clearAsrProcessingTimer();
          dropAudioUntilQuestionChangeRef.current = false;
          setState((s) => ({ ...s, isConnected: false }));
          if (relayConnectorRef.current?.canFailover) {
            void relayConnectorRef.current.failover("relay disconnected message");
          }
          break;
      }
    },
    [
      interruptPlayback,
      extractText,
      onTranscript,
      onError,
      onQuestionChange,
      saveProgress,
      tryCommitAssistantPlayback,
      clearResponseWatchdog,
      clearAsrInterimWatchdog,
      clearAsrProcessingTimer,
      startAsrInterimWatchdog,
      startAsrProcessingTimer,
      startResponseWatchdog,
    ]
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
      // Capture buffers are 256ms, which is wider than the provider's 200ms uplink packet, so
      // regroup them without disturbing the per-buffer level metering and barge-in cadence.
      const toUplinkFrames = createMicFrameChunker();

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
        if (rms >= ASR_INTERIM_AUDIO_ACTIVITY_RMS_THRESHOLD) {
          lastMicActivityAtRef.current = performance.now();
        }
        const level = Math.min(1, rms * 5);
        setState((s) => ({ ...s, audioLevel: level }));

        // Barge-in detection during TTS playback
        if (performance.now() < micHoldUntilRef.current) {
          if (rms >= BARGE_IN_RMS_THRESHOLD) {
            bargeInFramesRef.current += 1;
            if (bargeInFramesRef.current >= BARGE_IN_FRAME_COUNT) {
              micHoldUntilRef.current = 0;
              interruptPlayback();
              connector.sendJson({ type: "barge_in" });
            }
          } else {
            bargeInFramesRef.current = 0;
          }
        } else {
          bargeInFramesRef.current = 0;
        }

        toUplinkFrames(inputData, (frame) => {
          connector.sendJson({ type: "audio", data: encodeMicAudioChunk(frame) });
        });
      };

      processorRef.current = { processor, source, ctx };
      isListeningRef.current = true;
      setState((s) => ({ ...s, isListening: true, userTranscript: "" }));
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Microphone access failed";
      onError?.(msg);
    }
  }, [onError, interruptPlayback]);

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

  const requestQuestionTransition = useCallback(
    (direction: "next" | "previous") => {
      const connector = relayConnectorRef.current;
      if (!connector?.isReady) return;

      const currentIndex = currentQuestionIndexRef.current;
      const totalQuestions = totalQuestionsRef.current;
      const isAtBoundary =
        direction === "previous"
          ? currentIndex <= 0
          : currentIndex >= totalQuestions - 1;

      if (isAtBoundary) return;

      dropAudioUntilQuestionChangeRef.current = true;
      clearResponseWatchdog();
      clearAsrInterimWatchdog();
      interruptPlayback();
      chatBufferRef.current = "";
      asrBufferRef.current = "";
      lastOnAIResponseRef.current = "";

      setState((s) => ({
        ...s,
        isTransitioning: true,
        transitionDirection: direction,
        isSpeaking: false,
        isProcessing: false,
        userTranscript: "",
        aiTranscript: "",
        lastAssistantUtteranceEndedAt: 0,
      }));

      connector.sendJson({
        type: direction === "next" ? "next_question" : "prev_question",
      });
    },
    [clearAsrInterimWatchdog, clearResponseWatchdog, interruptPlayback],
  );

  /** Request transition to the next question */
  const nextQuestion = useCallback(() => {
    requestQuestionTransition("next");
  }, [requestQuestionTransition]);

  /** Request transition back to the previous question */
  const previousQuestion = useCallback(() => {
    requestQuestionTransition("previous");
  }, [requestQuestionTransition]);

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
      lastSentChatInputRef.current = {
        text: trimmed.replace(/\s+/g, " ").trim().toLowerCase(),
        at: Date.now(),
      };
      connector.sendJson({ type: "text_input", content: trimmed, source: "chat" });
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
    if (flushingPromiseRef.current) {
      await flushingPromiseRef.current;
    }

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

    const start = savedMessageCountRef.current;
    const unsaved = trackedMessagesRef.current.slice(start);
    if (unsaved.length === 0 && !sessionId) return;

    log.info(
      `Saving ${unsaved.length} remaining messages and completing session`
    );

    const payload = JSON.stringify({ sessionId, messages: unsaved, complete: true });

    try {
      await fetch("/api/voice/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    } catch (err) {
      // keepalive fetch can fail if body > 64KB; fall back to sendBeacon
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/voice/save",
          new Blob([payload], { type: "application/json" }),
        );
      }
      log.error("Failed to save voice data:", err);
    }
  }, [sessionId]);

  /** Return a JSON payload of unsaved messages for sendBeacon on unload. */
  const getUnsentPayload = useCallback((): string | null => {
    const start = savedMessageCountRef.current;
    const unsaved = trackedMessagesRef.current.slice(start);
    if (unsaved.length === 0) return null;
    return JSON.stringify({ sessionId, messages: unsaved });
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
    getUnsentPayload,
  };
}
