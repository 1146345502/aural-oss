"use client";

import { useRelayAsrInput } from "@/hooks/use-relay-asr-input";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

export type PrepVoiceRecording = {
  blob: Blob;
  url: string;
  durationMs: number;
};

type Props = {
  language?: string;
  onTranscript: (text: string) => void;
  onRecordingComplete?: (recording: PrepVoiceRecording) => void;
};

function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** ASR + local audio recording + level meter for practice voice mode. */
export function usePrepVoiceCapture({
  language,
  onTranscript,
  onRecordingComplete,
}: Props) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const baseTextRef = useRef("");
  const committedTranscriptRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelCtxRef = useRef<AudioContext | null>(null);
  const levelAnimRef = useRef<number | null>(null);
  const usesRelayRef = useRef(false);

  const relay = useRelayAsrInput({
    language,
    onTranscript: (text) => onTranscriptRef.current(text),
    onAudioLevel: setAudioLevel,
  });

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onRecordingCompleteRef.current = onRecordingComplete;
  }, [onTranscript, onRecordingComplete]);

  const stopLevelMeter = useCallback(() => {
    if (levelAnimRef.current) {
      cancelAnimationFrame(levelAnimRef.current);
      levelAnimRef.current = null;
    }
    void levelCtxRef.current?.close();
    levelCtxRef.current = null;
  }, []);

  const startBrowserLevelMeter = useCallback(
    (stream: MediaStream) => {
      stopLevelMeter();
      const ctx = new AudioContext();
      levelCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        levelAnimRef.current = requestAnimationFrame(tick);
      };
      levelAnimRef.current = requestAnimationFrame(tick);
    },
    [stopLevelMeter],
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopBrowserAsr = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const finishRecording = useCallback(
    async (notify = true): Promise<PrepVoiceRecording | null> => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      const durationMs = Math.max(0, Date.now() - startedAtRef.current);

      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          try {
            recorder.requestData();
          } catch {
            // ignore if not recording
          }
          recorder.stop();
        });
      }

      const mime = recorder?.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      if (blob.size === 0) return null;

      const recording: PrepVoiceRecording = {
        blob,
        url: URL.createObjectURL(blob),
        durationMs,
      };
      if (notify && onRecordingCompleteRef.current) {
        await onRecordingCompleteRef.current(recording);
      }
      return recording;
    },
    [],
  );

  const stop = useCallback(
    async (options?: { notify?: boolean }): Promise<PrepVoiceRecording | null> => {
      listeningRef.current = false;
      setListening(false);
      setAudioLevel(0);
      stopLevelMeter();
      stopTimer();
      relay.stop();
      stopBrowserAsr();
      const recording = await finishRecording(options?.notify ?? true);
      releaseStream();
      setElapsedMs(0);
      return recording;
    },
    [
    finishRecording,
    relay,
    releaseStream,
    stopBrowserAsr,
    stopLevelMeter,
    stopTimer,
  ]);

  const startRecorder = useCallback((stream: MediaStream) => {
    chunksRef.current = [];
    const mime = pickRecorderMime();
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(250);
    recorderRef.current = recorder;
  }, []);

  const startBrowserAsr = useCallback(
    () => {
      const speechWindow = window as SpeechWindow;
      const Recognition =
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
      if (!Recognition) {
        toast({
          title: "Voice input unavailable",
          description: "Use Chrome or Edge for speech recognition.",
          variant: "destructive",
        });
        return false;
      }

      recognitionRef.current?.abort();
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "zh" ? "zh-CN" : "en-US";

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const piece = result[0]?.transcript ?? "";
          if (result.isFinal) {
            committedTranscriptRef.current += piece;
          } else {
            interim += piece;
          }
        }
        const session = [committedTranscriptRef.current, interim]
          .filter(Boolean)
          .join("");
        onTranscriptRef.current(
          [baseTextRef.current, session.trim()].filter(Boolean).join(" "),
        );
      };
      recognition.onerror = () => {
        if (!listeningRef.current || recognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch {
          void stop();
        }
      };
      recognition.onend = () => {
        if (!listeningRef.current || recognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch {
          listeningRef.current = false;
          setListening(false);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      return true;
    },
    [language, stop, toast],
  );

  const start = useCallback(
    async (baseText: string) => {
      if (listening) return;
      baseTextRef.current = baseText.trim();
      committedTranscriptRef.current = "";
      onTranscriptRef.current(baseTextRef.current);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        listeningRef.current = true;
        setListening(true);
        startRecorder(stream);
        startBrowserLevelMeter(stream);

        timerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 200);

        if (relay.isRelayAvailable) {
          usesRelayRef.current = true;
          const ok = await relay.start(baseTextRef.current, stream);
          if (!ok) {
            usesRelayRef.current = false;
            toast({
              title: "Voice relay unavailable",
              description: "Falling back to browser speech recognition.",
            });
            startBrowserAsr();
          }
        } else {
          usesRelayRef.current = false;
          startBrowserAsr();
        }
      } catch {
        toast({
          title: "Microphone access denied",
          description: "Allow microphone access to use voice mode.",
          variant: "destructive",
        });
        await stop();
      }
    },
    [listening, relay, startBrowserAsr, startBrowserLevelMeter, startRecorder, stop, toast],
  );

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  return {
    listening,
    audioLevel,
    elapsedMs,
    start,
    stop,
  };
}
