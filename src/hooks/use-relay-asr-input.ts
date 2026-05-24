"use client";

import {
    mergeAsrFinal,
    mergeClientAsrInterim,
} from "@/lib/voice/asr-interim";
import {
    buildRelayTargets,
    RelayConnector,
    resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import { useCallback, useEffect, useRef } from "react";

function extractAsrText(msg: Record<string, unknown>): string {
  const data = msg.data as { results?: Array<{ text?: unknown }> } | undefined;
  const r0 = data?.results?.[0]?.text;
  if (typeof r0 === "string" && r0.trim()) return r0.trim();
  const top = msg.text ?? msg.transcript;
  if (typeof top === "string" && top.trim()) return top.trim();
  return "";
}

function relayAsrAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VOICE_RELAY_URL ||
    process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL
  );
}

/**
 * Continuous Volcengine ASR via voice relay `mic_test` mode (same as onboarding).
 */
export function useRelayAsrInput({
  language,
  onTranscript,
  sharedStream,
  onAudioLevel,
}: {
  language?: string;
  onTranscript: (text: string) => void;
  /** When set, relay ASR uses this stream instead of opening a second microphone. */
  sharedStream?: MediaStream | null;
  onAudioLevel?: (level: number) => void;
}) {
  const connectorRef = useRef<RelayConnector<Record<string, unknown>> | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const listeningRef = useRef(false);
  const baseTextRef = useRef("");
  /** Full session transcript for this recording (excludes baseText). */
  const sessionBufferRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const onAudioLevelRef = useRef(onAudioLevel);
  const sharedStreamRef = useRef(sharedStream);
  const ownsMicStreamRef = useRef(true);
  const pendingAudioRef = useRef<string[]>([]);
  const micCaptureStartedRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onAudioLevelRef.current = onAudioLevel;
    sharedStreamRef.current = sharedStream;
  }, [onTranscript, onAudioLevel, sharedStream]);

  const cleanupMic = useCallback(() => {
    workletRef.current?.disconnect();
    workletRef.current = null;
    micCaptureStartedRef.current = false;
    pendingAudioRef.current = [];
    if (ownsMicStreamRef.current) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    }
    micStreamRef.current = null;
    void micCtxRef.current?.close();
    micCtxRef.current = null;
  }, []);

  const flushPendingAudio = useCallback(() => {
    const connector = connectorRef.current;
    if (!connector?.isReady) return;
    while (pendingAudioRef.current.length > 0) {
      const hex = pendingAudioRef.current.shift();
      if (hex) connector.sendJson({ type: "audio", data: hex });
    }
  }, []);

  const sendAudioHex = useCallback(
    (hex: string) => {
      const connector = connectorRef.current;
      if (!connector?.isReady) {
        pendingAudioRef.current.push(hex);
        const maxBufferedChunks = 80;
        if (pendingAudioRef.current.length > maxBufferedChunks) {
          pendingAudioRef.current.shift();
        }
        return;
      }
      flushPendingAudio();
      connector.sendJson({ type: "audio", data: hex });
    },
    [flushPendingAudio],
  );

  const stop = useCallback(() => {
    listeningRef.current = false;
    connectorRef.current?.close();
    connectorRef.current = null;
    cleanupMic();
  }, [cleanupMic]);

  const startMicCapture = useCallback(async () => {
    if (!listeningRef.current || micCaptureStartedRef.current) return;
    try {
      const external = sharedStreamRef.current;
      const stream =
        external ??
        (await navigator.mediaDevices.getUserMedia({ audio: true }));
      if (!external) micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const workletCode = `
        class MicProcessor extends AudioWorkletProcessor {
          constructor() { super(); this._buf = new Float32Array(4096); this._pos = 0; }
          process(inputs) {
            const ch = inputs[0]?.[0];
            if (!ch) return true;
            for (let i = 0; i < ch.length; i++) {
              this._buf[this._pos++] = ch[i];
              if (this._pos >= 4096) { this.port.postMessage(this._buf); this._buf = new Float32Array(4096); this._pos = 0; }
            }
            return true;
          }
        }
        registerProcessor('mic-processor', MicProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "mic-processor");
      workletRef.current = worklet;
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(ctx.destination);
      micCaptureStartedRef.current = true;

      worklet.port.onmessage = (e) => {
        if (!listeningRef.current) return;
        const input = e.data as Float32Array;
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
        const rms = Math.sqrt(sumSq / input.length);
        onAudioLevelRef.current?.(Math.min(1, rms * 5));

        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
        }
        const bytes = new Uint8Array(pcm.buffer);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
          hex += bytes[i].toString(16).padStart(2, "0");
        }
        sendAudioHex(hex);
      };
    } catch {
      stop();
    }
  }, [sendAudioHex, stop]);

  const start = useCallback(
    async (baseText: string, externalStream?: MediaStream) => {
      if (!relayAsrAvailable() || listeningRef.current) return false;

      stop();
      baseTextRef.current = baseText.trim();
      sessionBufferRef.current = "";
      pendingAudioRef.current = [];
      listeningRef.current = true;
      if (externalStream) {
        sharedStreamRef.current = externalStream;
        ownsMicStreamRef.current = false;
      } else {
        ownsMicStreamRef.current = true;
      }

      // Capture mic + waveform immediately; relay connect may take 1–2s on production.
      void startMicCapture();

      const publish = () => {
        const merged = [baseTextRef.current, sessionBufferRef.current]
          .filter(Boolean)
          .join(" ");
        onTranscriptRef.current(merged);
      };

      const mergePartial = (partial: string) => {
        const chunk = partial.trim();
        if (!chunk) return;
        sessionBufferRef.current = mergeClientAsrInterim(
          sessionBufferRef.current,
          chunk,
        );
        publish();
      };

      const commitUtterance = (finalText: string) => {
        const chunk = finalText.trim();
        if (!chunk) return;
        sessionBufferRef.current = mergeAsrFinal(sessionBufferRef.current, chunk);
        publish();
      };

      const connector = new RelayConnector<Record<string, unknown>>({
        targets: buildRelayTargets({
          language,
          voiceRelayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL,
          openAiRelayUrl: process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL,
          primaryPreference: resolveRelayPrimaryPreference(
            process.env.NEXT_PUBLIC_VOICE_RELAY_PRIMARY,
          ),
          browserProtocol: window.location.protocol,
          browserHost: window.location.host,
        }),
        buildInitMessage: () => ({ type: "mic_test", language }),
        onConnected: () => {
          flushPendingAudio();
        },
        onJsonMessage: (msg, { connector: activeConnector }) => {
          if (!listeningRef.current) return;
          if (msg.type === "asr") {
            const text = extractAsrText(msg);
            if (text) mergePartial(text);
          } else if (msg.type === "asr_ended") {
            const text = ((msg.text as string) || "").trim();
            if (text) {
              commitUtterance(text);
            } else if (sessionBufferRef.current.trim()) {
              publish();
            }
          } else if (msg.type === "disconnected") {
            if (listeningRef.current && activeConnector.canFailover) {
              void activeConnector.failover("mic test ASR disconnected");
            }
          }
        },
        onPermanentFailure: () => {
          if (listeningRef.current) stop();
        },
      });

      connectorRef.current = connector;
      try {
        await connector.connect();
        flushPendingAudio();
        return listeningRef.current;
      } catch {
        stop();
        return false;
      }
    },
    [flushPendingAudio, language, startMicCapture, stop],
  );

  useEffect(() => {
    return () => {
      if (listeningRef.current) stop();
    };
  }, [stop]);

  return { start, stop, isRelayAvailable: relayAsrAvailable() };
}
