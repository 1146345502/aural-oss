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
import { DEFAULT_FOLLOW_UP_DEPTH } from "@/lib/follow-up-depth";
import { getMicTestMessage } from "@/lib/i18n";
import {
    setCameraSkipped,
    setScreenSkipped,
    setStoredScreenStream,
} from "@/lib/media-stream-store";
import { cn } from "@/lib/utils";
import {
    bufferMicAudioChunk,
    encodeMicAudioChunk,
    MIC_AUDIO_CHUNK_SAMPLES,
} from "@/lib/voice/mic-audio";
import {
    buildRelayTargets,
    isRecoverableRelayErrorMessage,
    RelayConnector,
    resolveRelayPrimaryPreference,
} from "@/lib/voice/relay-routing";
import { isBrowserPlayableTtsContentType } from "@/lib/voice/tts-content-type";
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

const STEPS = [
  { key: "info" as const, label: "Interview Info" },
  { key: "checklist" as const, label: "Checklist" },
  { key: "enter" as const, label: "Start" },
];

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
  children,
}: {
  onReady: () => void;
  children: React.ReactNode;
}) {
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
              <h3 className="text-xl font-bold text-gray-900">Welcome to your interview!</h3>
              <p className="text-[15px] font-medium text-gray-700">
                Take a quick tour of the interview interface.
              </p>
              <p className="text-sm leading-relaxed text-gray-500">
                We&apos;ll walk you through the key features — voice controls,
                transcript, whiteboard, and more — so you know exactly where
                everything is.
              </p>
              <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:items-stretch">
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-muted-foreground"
                  onClick={handleSkipTour}
                >
                  Skip for now
                </Button>
                <Button className="sm:flex-1" size="lg" onClick={handleStartTour}>
                  Take a quick tour
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
              <h3 className="text-lg font-semibold">You&apos;re all set!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                You can start the interview now, or restart the tour if you&apos;d like another look.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-stretch">
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => tour?.restart()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restart tour
              </Button>
              <Button className="sm:flex-1" size="lg" onClick={onReady}>
                Start Interview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: OnboardingStep }) {
  const stepIdxMap: Record<OnboardingStep, number> = { info: 0, checklist: 1, howItWorks: 2 };
  const currentIdx = Math.min(stepIdxMap[current], STEPS.length - 1);

  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center gap-2">
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
                {step.label}
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
  allowSkip = true,
}: {
  done: boolean;
  onDone: () => void;
  allowSkip?: boolean;
}) {
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
      setError("Unable to access camera. Please check permissions.");
    }
  }, []);

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
                  Keep your eyes on the camera
                </span>
              </div>
            )}
          </div>
          {!photo && !streaming && !done && (
            <Button size="sm" onClick={startCamera} className="w-full">
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              Start Collecting
            </Button>
          )}
          {streaming && (
            <Button size="sm" onClick={capture} className="w-full">
              Capture
            </Button>
          )}
          {photo && (
            <Button size="sm" variant="outline" onClick={retake} className="w-full">
              <RefreshCw className="mr-1 h-3 w-3" />
              Retake
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            The photo will be compared with snapshots during the interview, so
            please keep your face visible.
          </p>
          <p className="text-xs text-muted-foreground">
            Photo collection requires authorization, please operate according to
            browser prompts.
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={startCamera}>
                Retry
              </button>
            </div>
          )}
          {allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-muted-foreground">
              No camera?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                Skip
              </button>
            </p>
          )}
          {!allowSkip && !error && !photo && !streaming && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Camera is required for this interview.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              Collect photo
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              Collect photo
            </span>
          )}
        </div>
      </CardContent>
      <canvas ref={canvasRef} className="hidden" />
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip photo collection?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping photo collection is not recommended. The photo is used to
              verify your identity during the interview. Skipping may affect your
              interview results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCameraSkipped(true); onDone(); }}>
              Skip anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type MicPhase = "idle" | "requesting" | "playing" | "connecting" | "listening" | "analyzing" | "confirm";
const MIC_TEST_ECHO_SETTLE_MS = 200;
const MIC_TEST_INITIAL_ECHO_IGNORE_MS = 600;

function normalizeMicTestText(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'’.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMicTestTokens(text: string): string[] {
  return normalizeMicTestText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function isLikelyMicTestPromptEcho(text: string, language?: string): boolean {
  const normalized = normalizeMicTestText(text);
  if (normalized.length < 4) return false;

  const prompt = normalizeMicTestText(getMicTestMessage(language));
  if (!prompt) return false;

  if (normalized === prompt) return true;
  if (prompt.startsWith(normalized) || normalized.startsWith(prompt)) return true;

  const transcriptTokens = getMicTestTokens(normalized);
  if (transcriptTokens.length < 2) return false;

  const promptTokens = new Set(getMicTestTokens(prompt));
  if (promptTokens.size === 0) return false;

  const overlappingTokens = transcriptTokens.filter((token) => promptTokens.has(token)).length;
  const transcriptCoverage = overlappingTokens / transcriptTokens.length;
  const promptCoverage = overlappingTokens / promptTokens.size;

  return transcriptCoverage >= 0.75 && promptCoverage >= 0.2;
}

/** Partial ASR chunk is substantial enough to pass the mic test early (avoids finishing on single-letter noise). */
function isMicTestSubstantivePartial(text: string): boolean {
  const compact = normalizeMicTestText(text).replace(/\s/g, "");
  if (compact.length < 1) return false;
  if (compact.length === 1 && /^[a-z]$/i.test(compact)) return false;
  return true;
}

/** Parsed ASR text for mic test UI; does not affect confirmation / echo filtering. */
function extractMicTestAsrText(msg: Record<string, unknown>): string {
  const data = msg.data as { results?: Array<{ text?: unknown }> } | undefined;
  const r0 = data?.results?.[0]?.text;
  if (typeof r0 === "string" && r0.trim()) return r0.trim();
  const top = msg.text ?? msg.transcript;
  if (typeof top === "string" && top.trim()) return top.trim();
  return "";
}

function MicCheck({ done, onDone, language, allowSkip = true }: { done: boolean; onDone: () => void; language?: string; allowSkip?: boolean }) {
  const [phase, setPhase] = useState<MicPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [transcript, setTranscript] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const relayConnectorRef = useRef<RelayConnector<Record<string, unknown>> | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const listenDelayRef = useRef<number | null>(null);
  const listenTimeoutRef = useRef<number | null>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const languageRef = useRef(language);
  languageRef.current = language;

  const stopAll = useCallback(() => {
    if (listenDelayRef.current !== null) {
      window.clearTimeout(listenDelayRef.current);
      listenDelayRef.current = null;
    }
    if (listenTimeoutRef.current !== null) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
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
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
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
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    getSpeechSynthesisApi()?.cancel();
  }, [getSpeechSynthesisApi]);

  const startListening = useCallback(() => {
    setPhase("connecting");
    setTranscript("");

    let lastAsrText = "";
    let handled = false;
    let micStarted = false;
    let captureStartedAt = 0;
    let micReady = false;
    let relayReady = false;
    const pendingAudio: string[] = [];

    const markListeningReady = () => {
      if (handled || !micReady || !relayReady) return;
      setPhase("listening");
    };

    const flushPendingAudio = () => {
      const connector = relayConnectorRef.current;
      if (!connector?.isReady) return;
      while (pendingAudio.length > 0) {
        const chunk = pendingAudio.shift();
        if (chunk) connector.sendJson({ type: "audio", data: chunk });
      }
    };

    const finish = (text: string) => {
      if (handled) return;
      handled = true;
      pendingAudio.length = 0;
      if (listenTimeoutRef.current !== null) {
        window.clearTimeout(listenTimeoutRef.current);
        listenTimeoutRef.current = null;
      }
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
      } else {
        analyzeResponse("");
      }
    };

    const startMicCapture = async () => {
      if (micStarted || handled) return;
      micStarted = true;
      try {
        captureStartedAt = performance.now();
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
            constructor() { super(); this._buf = new Float32Array(${MIC_AUDIO_CHUNK_SAMPLES}); this._pos = 0; }
            process(inputs) {
              const ch = inputs[0]?.[0];
              if (!ch) return true;
              for (let i = 0; i < ch.length; i++) {
                this._buf[this._pos++] = ch[i];
                if (this._pos >= ${MIC_AUDIO_CHUNK_SAMPLES}) { this.port.postMessage(this._buf); this._buf = new Float32Array(${MIC_AUDIO_CHUNK_SAMPLES}); this._pos = 0; }
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
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        source.connect(worklet);
        worklet.connect(silentGain);
        silentGain.connect(ctx.destination);
        micReady = true;
        markListeningReady();

        worklet.port.onmessage = (e) => {
          if (handled) return;
          const input = e.data as Float32Array;
          const hex = encodeMicAudioChunk(input);
          const connector = relayConnectorRef.current;
          if (!connector?.isReady) {
            bufferMicAudioChunk(pendingAudio, hex);
            return;
          }
          flushPendingAudio();
          connector.sendJson({ type: "audio", data: hex });
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
        relayReady = true;
        flushPendingAudio();
        markListeningReady();
      },
      onJsonMessage: (msg, { connector: activeConnector }) => {
        if (handled) return;
        const isInitialEchoWindow =
          captureStartedAt > 0 &&
          performance.now() - captureStartedAt < MIC_TEST_INITIAL_ECHO_IGNORE_MS;
        if (msg.type === "asr") {
          const text = extractMicTestAsrText(msg);
          if (text) {
            setTranscript(text);
          }
          if (!text) return;
          if (
            isInitialEchoWindow ||
            isLikelyMicTestPromptEcho(text, languageRef.current)
          ) {
            return;
          }
          lastAsrText = text;
          if (isMicTestSubstantivePartial(text)) {
            finish(text);
          }
        } else if (msg.type === "asr_ended") {
          const text = ((msg.text as string) || lastAsrText).trim();
          if (
            text &&
            !isInitialEchoWindow &&
            !isLikelyMicTestPromptEcho(text, languageRef.current)
          ) {
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
    // Start capturing immediately and buffer while the relay establishes its
    // upstream ASR session. This prevents speech at the phase boundary from
    // being lost and makes "Listening" mean the whole pipeline is ready.
    void startMicCapture();
    void connector.connect().catch(() => {
      if (!handled) finish(lastAsrText);
    });

    listenTimeoutRef.current = window.setTimeout(() => {
      listenTimeoutRef.current = null;
      if (!handled) finish(lastAsrText);
    }, 25000);
  }, [analyzeResponse, stopTtsPlayback]);

  const startListeningAfterPlayback = useCallback(() => {
    if (listenDelayRef.current !== null) {
      window.clearTimeout(listenDelayRef.current);
    }
    listenDelayRef.current = window.setTimeout(() => {
      listenDelayRef.current = null;
      startListening();
    }, MIC_TEST_ECHO_SETTLE_MS);
  }, [startListening]);

  const playTTS = useCallback(async () => {
    stopTtsPlayback();
    getSpeechSynthesisApi()?.cancel();
    setError(null);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Unable to access microphone. Please check permissions.");
      setPhase("idle");
      return;
    }

    const msg = getMicTestMessage(language);

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const res = await fetch(`/api/voice/tts-s2s?format=wav&t=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "audio/mpeg, audio/wav",
          "Content-Type": "application/json",
          "X-Aural-TTS-Format": "wav",
        },
        body: JSON.stringify({ text: msg, language: languageRef.current }),
        signal: abort.signal,
      });

      abortRef.current = null;

      if (res.status === 204) {
        throw new Error("Seed TTS not available for this client");
      }

      if (!res.ok) {
        throw new Error(`Seed TTS HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!isBrowserPlayableTtsContentType(contentType)) {
        throw new Error(`Unexpected Seed TTS content type: ${contentType}`);
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        throw new Error("Seed TTS returned no audio");
      }

      const audioUrl = URL.createObjectURL(blob);
      audioObjectUrlRef.current = audioUrl;
      setPhase("playing");

      try {
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.preload = "auto";
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Seed TTS audio playback failed"));

          const startPlayback = () => {
            void audio.play().catch(reject);
          };

          // First decode after a fresh tab/HMR can glitch if play() races the decoder.
          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            startPlayback();
          } else {
            audio.addEventListener("canplaythrough", () => startPlayback(), { once: true });
            audio.load();
          }
        });
      } finally {
        audioRef.current = null;
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current);
          audioObjectUrlRef.current = null;
        }
      }
      startListeningAfterPlayback();
      return;
    } catch (err) {
      abortRef.current = null;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Unable to play Seed TTS. Please retry the microphone test.");
      setPhase("idle");
    }
  }, [getSpeechSynthesisApi, language, startListeningAfterPlayback, stopTtsPlayback]);

  useEffect(() => {
    return () => {
      stopAll();
      getSpeechSynthesisApi()?.cancel();
    };
  }, [getSpeechSynthesisApi, stopAll]);

  const isBusy = phase === "requesting" || phase === "playing" || phase === "connecting" || phase === "listening" || phase === "analyzing";

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
            {phase === "connecting" && (
              <span className="text-[11px] text-muted-foreground">Starting microphone...</span>
            )}
            {phase === "listening" && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  <span className="text-[11px] font-medium text-destructive">Listening...</span>
                </div>
                {transcript && (
                  <span className="line-clamp-2 max-w-[10rem] text-center text-[10px] leading-tight text-foreground/80">
                    &quot;{transcript}&quot;
                  </span>
                )}
              </div>
            )}
            {phase === "analyzing" && (
              <span className="text-[11px] text-muted-foreground">Analyzing...</span>
            )}
            {phase === "idle" && !done && (
              <span className="text-[11px] text-muted-foreground/50">
                Speaker &amp; Microphone
              </span>
            )}
            {done && !skipped && (
              <span className="text-xs font-medium text-secondary-600 dark:text-secondary-400">
                Audio confirmed
              </span>
            )}
          </div>
          {phase === "idle" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              Test Microphone
            </Button>
          )}
          {phase === "requesting" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Requesting mic...
            </Button>
          )}
          {phase === "playing" && (
            <Button size="sm" variant="outline" onClick={() => { stopAll(); setPhase("idle"); }} className="w-full">
              Stop
            </Button>
          )}
          {phase === "connecting" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Starting mic...
            </Button>
          )}
          {phase === "listening" && (
            <Button size="sm" variant="outline" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Listening...
            </Button>
          )}
          {phase === "analyzing" && (
            <Button size="sm" disabled className="w-full">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Analyzing...
            </Button>
          )}
          {phase === "confirm" && !done && (
            <Button size="sm" onClick={playTTS} className="w-full">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Play again
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            Test your speaker and microphone to ensure audio is working
            properly.
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "idle" && !done &&
              "Click \"Test Microphone\" to hear a message from the voice agent. Then speak your response to confirm the audio works — just like in the actual interview."}
            {phase === "requesting" &&
              "Granting microphone access..."}
            {phase === "playing" &&
              "The voice agent is speaking. Listening will start automatically."}
            {phase === "listening" &&
              "Speak briefly — any short phrase is fine — so we know the microphone is working."}
            {phase === "analyzing" &&
              "Checking your response..."}
            {phase === "confirm" && !done && allowSkip &&
              "We couldn't detect your voice. Try again, or "}
            {phase === "confirm" && !done && allowSkip && (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                skip this step
              </button>
            )}
            {phase === "confirm" && !done && allowSkip && "."}
            {phase === "confirm" && !done && !allowSkip &&
              "We couldn't detect your voice. Please try again."}
            {done &&
              "Audio test passed. Your speaker and microphone are working."}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={playTTS}>
                Retry
              </button>
            </div>
          )}
          {allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-muted-foreground">
              No microphone?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                Skip
              </button>
            </p>
          )}
          {!allowSkip && !error && phase === "idle" && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Microphone is required for this interview.
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
            <AlertDialogTitle>Skip microphone test?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping the microphone test is not recommended. If your speaker or
              microphone is not working properly, it may affect your interview
              experience and results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPhase("idle"); setSkipped(true); onDone(); }}>
              Skip anyway
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
  allowSkip = true,
}: {
  done: boolean;
  onDone: () => void;
  allowSkip?: boolean;
}) {
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
          "Please share your entire screen, not a window or tab. Click \"Share Screen\" and select \"Entire Screen\"."
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
      setError("Screen capture was denied or cancelled.");
    }
  }, [onDone]);

  if (!isSupported) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">Screen sharing unavailable</p>
              <p className="text-xs text-muted-foreground">
                Screen sharing requires a desktop browser (Chrome recommended).
                This step has been automatically skipped on your device.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center self-start pt-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              Skipped
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
                  Entire screen
                </span>
              </div>
            )}
          </div>
          {!done && (
            <Button size="sm" onClick={requestShare} className="w-full">
              <Monitor className="mr-1.5 h-3.5 w-3.5" />
              Share Screen
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            Screen capture requires authorization.
          </p>
          <p className="text-xs text-muted-foreground">
            After clicking &quot;Share Screen&quot;, please select{" "}
            <span className="font-medium text-foreground">
              &quot;Entire Screen&quot;
            </span>{" "}
            in the pop-up window and click &quot;Share&quot;.
          </p>
          {error && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button type="button" className="ml-auto font-medium underline" onClick={requestShare}>
                Retry
              </button>
            </div>
          )}
          {allowSkip && !error && !done && (
            <p className="text-xs text-muted-foreground">
              Can&apos;t share screen?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowSkipDialog(true)}>
                Skip
              </button>
            </p>
          )}
          {!allowSkip && !error && !done && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Screen sharing is required for this interview.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center self-start pt-0.5">
          {done ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-secondary-600 dark:text-secondary-400">
              <CheckCircle2 className="h-4 w-4" />
              Screen Capture
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2" />
              Screen Capture
            </span>
          )}
        </div>
      </CardContent>
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip screen sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping screen sharing is not recommended. Screen capture is used
              to monitor your interview environment. Skipping may affect your
              interview results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setScreenSkipped(true); onDone(); }}>
              Skip anyway
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
        <StepIndicator current="info" />
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 pb-8 sm:px-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{interviewTitle}</h2>

              <div className="mt-4 flex gap-6 text-sm">
                <div>
                  <span className="font-medium">Description</span>
                  <p className="mt-1 text-muted-foreground">
                    {interviewDescription || "No additional description."}
                  </p>
                </div>
              </div>

              <div className="mt-2 text-sm text-muted-foreground">
                {questionCount} questions &middot;{" "}
                {timeLimitMinutes
                  ? `${timeLimitMinutes} min`
                  : "No time limit"}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 p-4 sm:p-6">
              <h3 className="font-semibold">Integrity Notices</h3>
              {antiCheatingEnabled ? (
                <>
                  <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    To ensure fairness, the following integrity measures will be
                    actively enforced throughout this session.
                  </div>
                  <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                    <li>
                      To ensure that the interview runs properly, please use the
                      latest version of Chrome.
                    </li>
                    <li>
                      After completing your answers, please make sure that you have
                      submitted them to all questions. Otherwise it will affect your
                      results.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Tab switching and focus tracking:</span>{" "}
                      Leaving the interview page or switching to another window will
                      be automatically detected and recorded. If you leave more
                      than{" "}
                      <span className="font-medium text-primary">3</span> times,
                      your session will be flagged for review.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">External paste blocked:</span>{" "}
                      Pasting content from outside the interview page is not
                      allowed. You can copy and paste freely within the page.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Multiple screen detection:</span>{" "}
                      The system will detect if you have multiple monitors connected.
                      Please unplug or turn off additional screens before starting.
                    </li>
                    <li>
                      This interview requires a camera to collect your registration
                      photo and capture your behavior. All photos are privacy
                      protected.
                    </li>
                    <li>
                      The interview will screen capture throughout. Screen capture
                      requires authorization.
                    </li>
                  </ol>
                </>
              ) : (
                <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                  <li>
                    To ensure that the interview runs properly, please use the
                    latest version of Chrome.
                  </li>
                  <li>
                    After completing your answers, please make sure that you have
                    submitted them to all questions. Otherwise it will affect your
                    results.
                  </li>
                  <li>
                    Before the interview starts, please shut down any software or
                    web page with ads, message pop-ups. Please do not leave the
                    interview page during the whole process.
                  </li>
                  <li>
                    This interview requires a camera to collect your registration
                    photo and capture your behavior. All photos are privacy
                    protected.
                  </li>
                  <li>
                    The interview will screen capture throughout. Screen capture
                    requires authorization.
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
              I agree to the above notice and interview guidelines
            </label>
            <Button
              disabled={!agreed}
              onClick={() => setStep("checklist")}
              className="w-40"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (starting) {
    return <PreparingScreen />;
  }

  if (step === "howItWorks") {
    if (!voiceEnabled) {
      handleComplete();
      return null;
    }

    const mode = "voice" as const;

    const mockContext: InterviewContext = {
      title: interviewTitle,
      aiName: aiName ?? "AI Interviewer",
      aiTone: "professional",
      language: language ?? "en-US",
      followUpDepth: DEFAULT_FOLLOW_UP_DEPTH,
      questions: Array.from({ length: questionCount }, (_, i) => ({
        text: `Question ${i + 1}`,
        type: questionTypes?.[i] ?? "OPEN_ENDED",
        order: i,
      })),
    };

    return (
      <IntervieweeTourProvider mode={mode}>
        <PreviewWrapper onReady={handleComplete}>
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
        <IntervieweeTourOverlay />
      </IntervieweeTourProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {header}
      <StepIndicator current="checklist" />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-8">
        <CameraCheck done={cameraDone} onDone={() => setCameraDone(true)} allowSkip={!antiCheatingEnabled} />
        <MicCheck done={micDone} onDone={() => setMicDone(true)} language={language} allowSkip={!antiCheatingEnabled} />
        <ScreenCheck done={screenDone} onDone={() => setScreenDone(true)} allowSkip={!antiCheatingEnabled} />

        <div className="flex items-center justify-center gap-3 pt-4">
          <Button variant="outline" onClick={() => setStep("info")}>
            Back
          </Button>
          <Button disabled={!allChecksDone} onClick={() => {
            if (voiceEnabled) setStep("howItWorks");
            else onComplete();
          }}>
            Next
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Chrome is recommended for a better experience.
        </p>
      </div>
    </div>
  );
}
