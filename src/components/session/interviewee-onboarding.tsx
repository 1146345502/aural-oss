"use client";

import { PreparingScreen } from "@/components/session/preparing-screen";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AuralLogo } from "@/components/ui/aural-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { InterviewContext } from "@/hooks/use-voice";
import { useTranslations } from "@/locales";
import {
    setCameraSkipped,
    setScreenSkipped,
    setStoredScreenStream,
} from "@/lib/media-stream-store";
import { cn } from "@/lib/utils";
import {
    buildRelayTargets,
    isRecoverableRelayErrorMessage,
    RelayConnector,
    resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import {
    AlertCircle,
    AudioLines,
    Camera,
    CheckCircle2,
    Loader2,
    Mic,
    Monitor,
    RefreshCw,
    RotateCcw,
    ScreenShare,
    User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IntervieweeTourOverlay } from "./interviewee-tour-overlay";
import { IntervieweeTourProvider, useIntervieweeTour } from "./interviewee-tour-provider";
import { VoiceInterface } from "./voice-interface";

interface IntervieweeOnboardingProps {
  interviewTitle: string;
  interviewDescription?: string | null;
  questionCount: number;
  timeLimitMinutes?: number | null;
  language?: string;
  antiCheatingEnabled?: boolean;
  voiceEnabled?: boolean;
  chatEnabled?: boolean;
  aiName?: string;
  questionTypes?: string[];
  onComplete: () => void;
}

type OnboardingStep = "info" | "checklist" | "howItWorks";

const STEP_KEYS = ["info", "checklist", "enter"] as const;

function WelcomeIllustration() {
  return (
    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-orange-50 px-6 pt-6 pb-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/marketing/channel-screenshot-sm.webp"
        alt="Interview interface preview"
        className="block w-full rounded-t-lg"
      />
      <div className="absolute -bottom-px left-0 right-0 h-6 bg-gradient-to-t from-white/90 to-transparent" />
    </div>
  );
}

export function PreviewWrapper({
  onReady,
  language,
  children,
}: {
  onReady: () => void;
  language?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations(language);
  const tour = useIntervieweeTour();
  const tourDone = tour?.finished ?? false;
  const [welcomed, setWelcomed] = useState(false);
  const showWelcome = !welcomed && !tour?.active && !tourDone;

  const handleStartTour = useCallback(() => {
    setWelcomed(true);
    tour?.restart();
  }, [tour]);

  const handleSkipTour = useCallback(() => {
    setWelcomed(true);
    tour?.skip();
  }, [tour]);

  return (
    <div className="relative flex h-screen flex-col bg-background">
      {children}

      {/* Welcome overlay */}
      {showWelcome && (
        <div className="absolute inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/30 bg-white shadow-2xl">
            <WelcomeIllustration />
            <div className="space-y-3 px-8 pb-8 pt-2 text-center">
              <h3 className="text-xl font-bold text-gray-900">{t.onboarding.welcome.title}</h3>
              <p className="text-[15px] font-medium text-gray-700">
                {t.onboarding.welcome.subtitle}
              </p>
              <p className="text-sm leading-relaxed text-gray-500">
                {t.onboarding.welcome.body}
              </p>
              <div className="flex items-stretch gap-3 pt-3">
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-muted-foreground"
                  onClick={handleSkipTour}
                >
                  {t.onboarding.welcome.skipForNow}
                </Button>
                <Button className="flex-1" size="lg" onClick={handleStartTour}>
                  {t.onboarding.welcome.takeQuickTour}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tour complete overlay */}
      {tourDone && (
        <div className="absolute inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{t.onboarding.tourComplete.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.onboarding.tourComplete.body}
              </p>
            </div>
            <div className="flex items-stretch gap-3">
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => tour?.restart()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.onboarding.tourComplete.restartTour}
              </Button>
              <Button className="flex-1" size="lg" onClick={onReady}>
                {t.onboarding.tourComplete.startInterview}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current, language }: { current: OnboardingStep; language?: string }) {
  const t = useTranslations(language);
  const stepIdxMap: Record<OnboardingStep, number> = { info: 0, checklist: 1, howItWorks: 2 };
  const currentIdx = Math.min(stepIdxMap[current], STEP_KEYS.length - 1);

  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {STEP_KEYS.map((stepKey, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={stepKey} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={cn(
                  "h-px w-12 sm:w-20",
                  isComplete ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  isComplete
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "border border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  isCurrent
                    ? "font-medium text-foreground"
                    : isComplete
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
              >
                {t.onboarding.steps[stepKey]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CameraCheck({
  done,
  onDone,
  language,
  allowSkip = true,
}: {
  done: boolean;
  onDone: () => void;
  language?: string;
  allowSkip?: boolean;
}) {
  const t = useTranslations(language);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [streaming]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setPhoto(null);
      setStreaming(true);
    } catch {
      setError(t.onboarding.camera.accessError);
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    setPhoto(dataUrl);
    onDone();
  }, [stopCamera, onDone]);

  const retake = useCallback(() => {
    setPhoto(null);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-36 w-44 overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt="Captured photo"
                className="h-full w-full object-cover"
              />
            ) : streaming ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <User className="h-10 w-10 text-muted-foreground/30" />
                <span className="text-[11px] text-muted-foreground/50">
                  {t.onboarding.camera.keepEyesOnCamera}
                </span>
              </div>
            )}
          </div>
          {!photo && !streaming && !done && (
            <Button size="sm" onClick={startCamera} className="w-full">
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              {t.onboarding.camera.startCollecting}
            </Button>
          )}
          {streaming && (
            <Button size="sm" onClick={capture} className="w-full">
              {t.onboarding.camera.capture}
            </Button>
          )}
          {photo && (
            <Button size="sm" variant="outline" onClick={retake} className="w-full">
              <RefreshCw className="mr-1 h-3 w-3" />
              {t.onboarding.camera.retake}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t.onboarding.camera.compareNotice}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.onboarding.camera.authNotice}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={startCamera}>
                {t.onboarding.common.retry}
              </button>
            </div>
          )}
          {allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-muted-foreground">
              {t.onboarding.camera.noCamera}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t.onboarding.common.skip}
              </button>
            </p>
          )}
          {!allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t.onboarding.camera.required}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t.onboarding.camera.collectPhoto}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              {t.onboarding.camera.collectPhoto}
            </span>
          )}
        </div>
      </CardContent>
      <canvas ref={canvasRef} className="hidden" />
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.onboarding.camera.skipTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.onboarding.camera.skipBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.onboarding.common.goBack}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCameraSkipped(true); onDone(); }}>
              {t.onboarding.common.skipAnyway}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type MicPhase = "idle" | "requesting" | "playing" | "listening" | "analyzing" | "confirm";

function MicCheck({ done, onDone, language, allowSkip = true }: { done: boolean; onDone: () => void; language?: string; allowSkip?: boolean }) {
  const t = useTranslations(language);
  const [phase, setPhase] = useState<MicPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [transcript, setTranscript] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const relayConnectorRef = useRef<RelayConnector<Record<string, unknown>> | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const languageRef = useRef(language);
  languageRef.current = language;

  const stopAll = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    relayConnectorRef.current?.close();
    relayConnectorRef.current = null;
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const analyzeResponse = useCallback((text: string) => {
    setPhase("analyzing");
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      setPhase("idle");
      onDoneRef.current();
      return;
    }
    setPhase("confirm");
  }, []);

  const getSpeechSynthesisApi = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }

    return window.speechSynthesis;
  }, []);

  const stopTtsPlayback = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    getSpeechSynthesisApi()?.cancel();
  }, [getSpeechSynthesisApi]);

  const startListening = useCallback((quiet = false) => {
    if (!quiet) {
      setPhase("listening");
      setTranscript("");
    }

    let lastAsrText = "";
    let handled = false;
    let micStarted = false;

    const finish = (text: string) => {
      if (handled) return;
      handled = true;
      stopTtsPlayback();
      if (micCtxRef.current) {
        micCtxRef.current.close().catch(() => {});
        micCtxRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      relayConnectorRef.current?.close();
      relayConnectorRef.current = null;
      if (text.trim()) {
        analyzeResponse(text);
      } else if (!quiet) {
        analyzeResponse("");
      }
    };

    const startMicCapture = async () => {
      if (micStarted || handled) return;
      micStarted = true;
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
        micStreamRef.current = stream;

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
        source.connect(worklet);
        worklet.connect(ctx.destination);

        worklet.port.onmessage = (e) => {
          if (handled || !relayConnectorRef.current?.isReady) return;
          const input = e.data as Float32Array;
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          }
          const bytes = new Uint8Array(pcm.buffer);
          let hex = "";
          for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
          }
          relayConnectorRef.current?.sendJson({ type: "audio", data: hex });
        };
      } catch {
        finish("");
      }
    };

    const connector = new RelayConnector<Record<string, unknown>>({
      targets: buildRelayTargets({
        language: languageRef.current,
        voiceRelayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL,
        openAiRelayUrl: process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL,
        primaryPreference: resolveRelayPrimaryPreference(
          process.env.NEXT_PUBLIC_VOICE_RELAY_PRIMARY,
        ),
        browserProtocol: window.location.protocol,
        browserHost: window.location.host,
      }),
      buildInitMessage: () => ({ type: "mic_test", language: languageRef.current }),
      onConnected: () => {
        void startMicCapture();
      },
      onJsonMessage: (msg, { connector: activeConnector }) => {
        if (handled) return;
        if (msg.type === "asr") {
          const data = msg.data as { results?: Array<{ text?: string }> } | undefined;
          const results = data?.results || [];
          if (results.length > 0 && results[0].text) {
            lastAsrText = results[0].text;
            setTranscript(lastAsrText);
            stopTtsPlayback();
            setPhase("listening");
          }
        } else if (msg.type === "asr_ended") {
          const text = ((msg.text as string) || lastAsrText).trim();
          if (text) {
            finish(text);
          }
        } else if (msg.type === "disconnected") {
          if (activeConnector.canFailover) {
            void activeConnector.failover("mic test relay disconnected");
          } else {
            finish(lastAsrText);
          }
        } else if (msg.type === "error") {
          const message = (msg.message as string) || "";
          if (
            isRecoverableRelayErrorMessage(message) &&
            activeConnector.canFailover
          ) {
            return;
          }
          finish(lastAsrText);
        } else if (msg.type === "timeout") {
          finish(lastAsrText);
        }
      },
      onPermanentFailure: () => {
        if (!handled) finish(lastAsrText);
      },
    });

    relayConnectorRef.current = connector;
    void connector.connect().catch(() => {
      if (!handled) finish(lastAsrText);
    });

    setTimeout(() => {
      if (!handled) finish(lastAsrText);
    }, 25000);
  }, [analyzeResponse, stopTtsPlayback]);

  const playTTS = useCallback(async () => {
    setError(null);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError(t.onboarding.mic.accessError);
      setPhase("idle");
      return;
    }

    startListening(true);
    setPhase("playing");

    const msg = t.micTest.greeting;

    // Try S2S streaming endpoint first (same voice as interview)
    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const res = await fetch("/api/voice/tts-s2s", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aural-TTS-Format": "pcm_f32le",
        },
        body: JSON.stringify({ text: msg, language: languageRef.current }),
        signal: abort.signal,
      });

      if (res.ok && res.body) {
        const ctx = new AudioContext({ sampleRate: 24000 });
        audioCtxRef.current = ctx;
        // This runs after the awaited getUserMedia prompt above, not
        // synchronously in the click handler — some browsers (notably
        // Safari) start the context "suspended" in that case, which plays
        // silence. resume() is a no-op if it's already running.
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        const reader = res.body.getReader();
        let playTime = ctx.currentTime;
        let leftover: Uint8Array | null = null;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone || !value || value.length === 0) break;

          // Merge leftover bytes from previous chunk to maintain
          // float32 sample alignment (4 bytes per sample).
          let bytes: Uint8Array;
          if (leftover) {
            bytes = new Uint8Array(leftover.length + value.length);
            bytes.set(leftover);
            bytes.set(value, leftover.length);
            leftover = null;
          } else {
            bytes = value;
          }

          const remainder = bytes.length % 4;
          const usable = bytes.length - remainder;
          if (remainder > 0) {
            leftover = bytes.slice(usable);
          }
          if (usable === 0) continue;

          // Copy into a properly-aligned ArrayBuffer for Float32Array
          const aligned = new ArrayBuffer(usable);
          new Uint8Array(aligned).set(bytes.subarray(0, usable));
          const float32 = new Float32Array(aligned);

          if (float32.length === 0) continue;

          const buf = ctx.createBuffer(1, float32.length, 24000);
          buf.getChannelData(0).set(float32);
          const source = ctx.createBufferSource();
          source.buffer = buf;
          source.connect(ctx.destination);

          const startAt = Math.max(ctx.currentTime, playTime);
          source.start(startAt);
          playTime = startAt + buf.duration;
        }

        // Wait for all scheduled audio to finish, then listen
        const remaining = playTime - ctx.currentTime;
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining * 1000 + 100));
        }
        ctx.close().catch(() => {});
        audioCtxRef.current = null;
        abortRef.current = null;
        if (relayConnectorRef.current?.isReady) {
          setPhase("listening");
        } else {
          startListening();
        }
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // S2S unavailable, fall back to browser SpeechSynthesis
    }

    fallbackToSpeechSynthesis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening]);

  const fallbackToSpeechSynthesis = useCallback(() => {
    const speechSynthesisApi = getSpeechSynthesisApi();
    if (!speechSynthesisApi || typeof SpeechSynthesisUtterance === "undefined") {
      startListening();
      return;
    }

    setPhase("playing");
    const msg = t.micTest.greeting;
    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = t.meta.speechSynthesisLocale;
    utterance.onend = () => { if (relayConnectorRef.current?.isReady) { setPhase("listening"); } else { startListening(); } };
    utterance.onerror = () => { if (relayConnectorRef.current?.isReady) { setPhase("listening"); } else { startListening(); } };
    speechSynthesisApi.speak(utterance);
  }, [getSpeechSynthesisApi, startListening, language]);

  useEffect(() => {
    return () => {
      stopAll();
      getSpeechSynthesisApi()?.cancel();
    };
  }, [getSpeechSynthesisApi, stopAll]);

  const isBusy = phase === "requesting" || phase === "playing" || phase === "listening" || phase === "analyzing";

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-36 w-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50">
            <AudioLines
              className={cn(
                "h-10 w-10 transition-colors",
                isBusy ? "text-primary" : "text-muted-foreground/30"
              )}
            />
            {phase === "playing" && (
              <div className="flex h-5 w-28 items-end justify-center gap-[3px]">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 animate-pulse rounded-full bg-primary"
                    style={{
                      height: `${4 + Math.random() * 14}px`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
            )}
            {phase === "listening" && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  <span className="text-[11px] font-medium text-destructive">{t.onboarding.mic.listening}</span>
                </div>
                {transcript && (
                  <span className="max-w-[10rem] truncate text-[10px] text-muted-foreground">
                    &quot;{transcript}&quot;
                  </span>
                )}
              </div>
            )}
            {phase === "analyzing" && (
              <span className="text-[11px] text-muted-foreground">{t.onboarding.mic.analyzing}</span>
            )}
            {phase === "idle" && !done && (
              <span className="text-[11px] text-muted-foreground/50">
                {t.onboarding.mic.speakerMicLabel}
              </span>
            )}
            {done && !skipped && (
              <span className="text-xs font-medium text-secondary-600 dark:text-secondary-400">
                {t.onboarding.mic.audioConfirmed}
              </span>
            )}
          </div>
          {phase === "idle" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              {t.onboarding.mic.testMicrophone}
            </Button>
          )}
          {phase === "requesting" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t.onboarding.mic.requestingAccess}
            </Button>
          )}
          {phase === "playing" && (
            <Button size="sm" variant="outline" onClick={() => { stopAll(); setPhase("idle"); }} className="w-full">
              {t.onboarding.mic.stop}
            </Button>
          )}
          {phase === "listening" && (
            <Button size="sm" variant="outline" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t.onboarding.mic.listening}
            </Button>
          )}
          {phase === "analyzing" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t.onboarding.mic.analyzing}
            </Button>
          )}
          {phase === "confirm" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t.onboarding.mic.playAgain}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t.onboarding.mic.testInstruction}
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "idle" && !done &&
              t.onboarding.mic.instructionIdle}
            {phase === "requesting" &&
              t.onboarding.mic.instructionRequesting}
            {phase === "playing" &&
              t.onboarding.mic.instructionPlaying}
            {phase === "listening" &&
              t.onboarding.mic.instructionListening}
            {phase === "analyzing" &&
              t.onboarding.mic.instructionAnalyzing}
            {phase === "confirm" && !done && allowSkip &&
              t.onboarding.mic.instructionConfirmRetry}
            {phase === "confirm" && !done && allowSkip && (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t.onboarding.mic.skipThisStep}
              </button>
            )}
            {phase === "confirm" && !done && allowSkip && "."}
            {phase === "confirm" && !done && !allowSkip &&
              t.onboarding.mic.instructionConfirmNoSkip}
            {done &&
              t.onboarding.mic.instructionDone}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={playTTS}>
                {t.onboarding.common.retry}
              </button>
            </div>
          )}
          {allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-muted-foreground">
              {t.onboarding.mic.noMic}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t.onboarding.common.skip}
              </button>
            </p>
          )}
          {!allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t.onboarding.mic.required}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              Microphone
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              Microphone
            </span>
          )}
        </div>
      </CardContent>
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.onboarding.mic.skipTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.onboarding.mic.skipBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.onboarding.common.goBack}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPhase("idle"); setSkipped(true); onDone(); }}>
              {t.onboarding.common.skipAnyway}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ScreenCheck({
  done,
  onDone,
  language,
  allowSkip = true,
}: {
  done: boolean;
  onDone: () => void;
  language?: string;
  allowSkip?: boolean;
}) {
  const t = useTranslations(language);
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);

  // getDisplayMedia is unavailable on iOS Safari and most mobile browsers
  const [isSupported, setIsSupported] = useState(true);
  const autoSkippedRef = useRef(false);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia;
    setIsSupported(supported);
    if (!supported && !done && !autoSkippedRef.current) {
      autoSkippedRef.current = true;
      setScreenSkipped(true);
      onDone();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestShare = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      // Validate that the user shared the entire screen, not a tab or window
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings() as MediaTrackSettings & { displaySurface?: string };
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        setError(
          t.onboarding.screen.shareTooNarrowError
        );
        return;
      }

      const videoEl = document.createElement("video");
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play();

      await new Promise((r) => setTimeout(r, 300));

      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext("2d")?.drawImage(videoEl, 0, 0);
      setThumbnail(canvas.toDataURL("image/jpeg", 0.7));

      // Keep the stream alive for the interview recording to reuse
      setStoredScreenStream(stream);
      videoEl.srcObject = null;
      onDone();
    } catch {
      setError(t.onboarding.screen.shareDenied);
    }
  }, [onDone, t]);

  if (!isSupported) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">{t.onboarding.screen.unavailableTitle}</p>
              <p className="text-xs text-muted-foreground">
                {t.onboarding.screen.unavailableBody}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center self-start pt-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t.onboarding.screen.skipped}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-36 w-44 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/50">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt="Screen capture preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ScreenShare className="h-10 w-10 text-muted-foreground/30" />
                <span className="text-[11px] text-muted-foreground/50">
                  {t.onboarding.screen.entireScreen}
                </span>
              </div>
            )}
          </div>
          {!done && (
            <Button size="sm" onClick={requestShare} className="w-full">
              <Monitor className="mr-1.5 h-3.5 w-3.5" />
              {t.onboarding.screen.shareScreen}
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {t.onboarding.screen.authNotice}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.onboarding.screen.afterClickNotice}{" "}
            <span className="font-medium text-foreground">
              {t.onboarding.screen.entireScreenQuoted}
            </span>{" "}
            {t.onboarding.screen.popupNotice}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={requestShare}>
                {t.onboarding.common.retry}
              </button>
            </div>
          )}
          {allowSkip && !error && !done && (
            <p className="text-xs text-muted-foreground">
              {t.onboarding.screen.cantShare}{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                {t.onboarding.common.skip}
              </button>
            </p>
          )}
          {!allowSkip && !error && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t.onboarding.screen.required}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              {t.onboarding.screen.screenCapture}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              {t.onboarding.screen.screenCapture}
            </span>
          )}
        </div>
      </CardContent>
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.onboarding.screen.skipTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.onboarding.screen.skipBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.onboarding.common.goBack}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setScreenSkipped(true); onDone(); }}>
              {t.onboarding.common.skipAnyway}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function IntervieweeOnboarding({
  interviewTitle,
  interviewDescription,
  questionCount,
  timeLimitMinutes,
  language,
  antiCheatingEnabled = false,
  voiceEnabled = false,
  chatEnabled = false,
  aiName = "AI Interviewer",
  questionTypes = [],
  onComplete,
}: IntervieweeOnboardingProps) {
  const t = useTranslations(language);
  const [step, setStep] = useState<OnboardingStep>("info");
  const [agreed, setAgreed] = useState(false);

  const [cameraDone, setCameraDone] = useState(false);
  const [micDone, setMicDone] = useState(false);
  const [screenDone, setScreenDone] = useState(false);
  const [starting, setStarting] = useState(false);

  const allChecksDone = cameraDone && micDone && screenDone;

  const handleComplete = useCallback(() => {
    setStarting(true);
    onComplete();
  }, [onComplete]);

  const header = (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-card px-4 sm:px-6">
      <div className="flex items-center gap-1">
        <AuralLogo size={28} className="shrink-0" />
        <span className="font-heading text-base font-bold tracking-[2px]">AURAL</span>
      </div>
    </header>
  );

  if (step === "info") {
    return (
      <div className="flex min-h-screen flex-col bg-muted/30">
        {header}
        <StepIndicator current="info" language={language} />
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-8 sm:px-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{interviewTitle}</h2>

              <div className="mt-4 flex gap-6 text-sm">
                <div>
                  <span className="font-medium">{t.onboarding.info.description}</span>
                  <p className="mt-1 text-muted-foreground">
                    {interviewDescription || t.onboarding.info.noDescription}
                  </p>
                </div>
              </div>

              <div className="mt-2 text-sm text-muted-foreground">
                {questionCount} {t.onboarding.info.questions} &middot;{" "}
                {timeLimitMinutes
                  ? `${timeLimitMinutes} ${t.onboarding.info.min}`
                  : t.onboarding.info.noTimeLimit}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 p-4 sm:p-6">
              <h3 className="font-semibold">{t.onboarding.info.integrityTitle}</h3>
              {antiCheatingEnabled ? (
                <>
                  <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    {t.onboarding.info.antiCheatingIntro}
                  </div>
                  <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                    <li>
                      {t.onboarding.info.chromeNotice}
                    </li>
                    <li>
                      {t.onboarding.info.submitAllNotice}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t.onboarding.info.tabSwitchLabel}</span>{" "}
                      {t.onboarding.info.tabSwitchBody}{" "}
                      <span className="font-medium text-primary">3</span>{" "}
                      {t.onboarding.info.tabSwitchLimit}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t.onboarding.info.pasteLabel}</span>{" "}
                      {t.onboarding.info.pasteBody}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t.onboarding.info.multiScreenLabel}</span>{" "}
                      {t.onboarding.info.multiScreenBody}
                    </li>
                    <li>
                      {t.onboarding.info.cameraNotice}
                    </li>
                    <li>
                      {t.onboarding.info.screenCaptureNotice}
                    </li>
                  </ol>
                </>
              ) : (
                <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                  <li>
                    {t.onboarding.info.chromeNotice}
                  </li>
                  <li>
                    {t.onboarding.info.submitAllNotice}
                  </li>
                  <li>
                    {t.onboarding.info.noAntiCheatingNotice}
                  </li>
                  <li>
                    {t.onboarding.info.cameraNotice}
                  </li>
                  <li>
                    {t.onboarding.info.screenCaptureNotice}
                  </li>
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
              />
              {t.onboarding.info.agree}
            </label>
            <Button
              disabled={!agreed}
              onClick={() => setStep("checklist")}
              className="w-40"
            >
              {t.onboarding.common.next}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (starting) {
    return <PreparingScreen language={language} />;
  }

  if (step === "howItWorks") {
    if (!voiceEnabled) {
      handleComplete();
      return null;
    }

    const mockContext: InterviewContext = {
      title: interviewTitle,
      aiName: aiName ?? "AI Interviewer",
      aiTone: "professional",
      language: language ?? "en-US",
      followUpDepth: "medium",
      questions: Array.from({ length: questionCount }, (_, i) => ({
        text: `Question ${i + 1}`,
        type: questionTypes?.[i] ?? "OPEN_ENDED",
        order: i,
      })),
    };

    return (
      <IntervieweeTourProvider mode="voice">
        <PreviewWrapper onReady={handleComplete} language={language}>
          <VoiceInterface
            sessionId="__preview__"
            interviewId="__preview__"
            interviewTitle={interviewTitle}
            aiName={aiName ?? "AI Interviewer"}
            questionCount={questionCount}
            interviewContext={mockContext}
            durationMinutes={timeLimitMinutes ?? undefined}
            chatEnabled={chatEnabled}
            onComplete={() => {}}
            preview
          />
        </PreviewWrapper>
        <IntervieweeTourOverlay language={language} />
      </IntervieweeTourProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {header}
      <StepIndicator current="checklist" language={language} />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-8">
        <CameraCheck done={cameraDone} onDone={() => setCameraDone(true)} language={language} allowSkip={!antiCheatingEnabled} />
        <MicCheck done={micDone} onDone={() => setMicDone(true)} language={language} allowSkip={!antiCheatingEnabled} />
        <ScreenCheck done={screenDone} onDone={() => setScreenDone(true)} language={language} allowSkip={!antiCheatingEnabled} />

        <div className="flex items-center justify-center gap-3 pt-4">
          <Button variant="outline" onClick={() => setStep("info")}>
            {t.onboarding.common.back}
          </Button>
          <Button
            disabled={!allChecksDone}
            onClick={() => {
              if (voiceEnabled) setStep("howItWorks");
              else onComplete();
            }}
          >
            {t.onboarding.common.next}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t.onboarding.info.chromeRecommended}
        </p>
      </div>
    </div>
  );
}
