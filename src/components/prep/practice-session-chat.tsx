"use client";

import { AiGlowBorder } from "@/components/ui/ai-glow-border";
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
import { Badge } from "@/components/ui/badge";
import { ChatComposer } from "@/components/ui/chat-composer";
import {
  CoachSpeakingWave,
  type CoachSpeakingPhase,
} from "@/components/ui/coach-speaking-wave";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StreamingTextPanels } from "@/components/ui/streaming-text-panels";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PrepVoiceRecording } from "@/hooks/use-prep-voice-capture";
import { useToast } from "@/hooks/use-toast";
import { useVolcengineTts } from "@/hooks/use-volcengine-tts";
import { isAbortError } from "@/lib/abort-error";
import { computeMediaRetention, type PlanTier } from "@/lib/media-retention";
import { formatPrepAudioDuration, resolveBlobDuration } from "@/lib/prep/answer-audio";
import { resolvePrepResponseLanguage } from "@/lib/prep/answer-quality";
import { prepareCoachTtsText } from "@/lib/prep/coach-tts-text";
import {
  abortPrepFeedbackDiag,
  finishPrepFeedbackDiag,
  getPrepFeedbackDiagTraceId,
  markPrepFeedbackDiag,
  markRecordingComplete,
  startPrepFeedbackDiag,
} from "@/lib/prep/feedback-latency-diag";
import {
  hasPartialFeedbackHeader,
  parsePartialPrepFeedback,
} from "@/lib/prep/parse-partial-feedback-json";
import { buildPracticeResumeState } from "@/lib/prep/practice-resume-state";
import {
  buildVoiceDeliveryMetrics,
  type VoiceDeliveryMetrics,
} from "@/lib/prep/voice-delivery";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Info,
  Loader2,
  MessageSquareText,
  Mic,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Waves,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readPrepStream } from "./prep-stream";
import {
  PrepSuggestedAnswerPanel,
  type PrepContextInitial,
} from "./prep-suggested-answer-panel";
import {
  EMPTY_FEEDBACK,
  scoreTone,
  type PrepAttempt,
  type PrepFeedback,
  type PrepQuestion,
} from "./prep-types";

type Mode = "TEXT" | "VOICE";
type Phase = "idle" | "thinking" | "writing" | "finalizing";

type FeedbackFinal = {
  attemptId?: string;
  feedback?: PrepFeedback;
  score?: number;
  attemptNumber?: number;
};

type ActivePrompt = {
  kind: "question";
  questionId: string;
  questionIndex: number;
  prompt: string;
};

type ChatMessage =
  | {
      id: string;
      role: "assistant";
      kind: "intro" | "question" | "followup" | "error";
      content: string;
      questionIndex?: number;
      questionType?: string;
    }
  | {
      id: string;
      role: "user";
      kind: "answer";
      content: string;
      mode: Mode;
      audioUrl?: string;
      audioDurationMs?: number;
      audioCreatedAt?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "feedback";
      feedback?: PrepFeedback;
      feedbackPartial?: boolean;
      phase?: Phase;
      thinkingText?: string;
      streamingText?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "refinement";
      refinement?: {
        verdict: string;
        stillStrong: string[];
        stillMissing: string[];
      };
      phase?: Phase;
      thinkingText?: string;
      streamingText?: string;
    }
  | {
      id: string;
      role: "system";
      kind: "system";
      content: string;
    };

function id() {
  return crypto.randomUUID();
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeFeedback(feedback?: PrepFeedback): PrepFeedback {
  return {
    ...EMPTY_FEEDBACK,
    ...(feedback ?? {}),
    strengths: safeStringArray(feedback?.strengths),
    improvements: safeStringArray(feedback?.improvements),
    missingSignals: safeStringArray(feedback?.missingSignals),
    resumeLeverage: safeStringArray(feedback?.resumeLeverage),
    needsUserVerification: safeStringArray(feedback?.needsUserVerification),
    voiceDelivery: feedback?.voiceDelivery,
  };
}

function formatMinutes(seconds: number): string {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function questionMessage(question: PrepQuestion, index: number): ChatMessage {
  return {
    id: id(),
    role: "assistant",
    kind: "question",
    content: question.text,
    questionIndex: index,
    questionType: question.type || "OPEN_ENDED",
  };
}

function feedbackPhaseLabel(phase?: Phase, streamingLength = 0): string {
  if (phase === "thinking") return "Reading your answer";
  if (phase === "writing") {
    if (streamingLength > 900) return "Structuring feedback";
    if (streamingLength > 300) return "Scoring signals";
    return "Drafting coaching";
  }
  if (phase === "finalizing") return "Finalizing";
  return "Preparing feedback";
}

export function PracticeSessionChat({
  interviewId,
  sessionId,
  interviewTitle,
  language,
  hasContext,
  prepContext,
  onPrepContextSaved,
  questions,
  mode,
  remainingSeconds,
  attempts,
  planTier = "Self-hosted",
  mediaRetentionDays = 7,
  onAttemptCreated,
  onFinish,
  isFinishing = false,
}: {
  interviewId: string;
  sessionId: string;
  interviewTitle: string;
  language: string;
  hasContext: boolean;
  prepContext: PrepContextInitial;
  onPrepContextSaved?: () => void;
  questions: PrepQuestion[];
  mode: Mode;
  remainingSeconds: number | null;
  attempts: PrepAttempt[];
  planTier?: PlanTier;
  mediaRetentionDays?: number;
  onAttemptCreated: () => void;
  onFinish: () => void;
  isFinishing?: boolean;
}) {
  const { toast } = useToast();
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const desktopScrollAreaRef = useRef<HTMLDivElement>(null);
  const mobileScrollAreaRef = useRef<HTMLDivElement>(null);
  const questionMessageRefs = useRef<Map<number, HTMLDivElement[]>>(new Map());
  const messageAnchorRefs = useRef<Map<string, HTMLDivElement[]>>(new Map());
  /** Keep chat scrolled to this question until the user submits an answer. */
  const [pinnedQuestionIndex, setPinnedQuestionIndex] = useState<number | null>(
    null,
  );
  /** Scroll to the top of this message (answer, feedback, etc.). */
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const lastPinnedQuestionScrollRef = useRef<number | null>(null);
  const lastPinnedMessageScrollRef = useRef<string | null>(null);
  const promptStartedAtRef = useRef(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  const [splitPercent, setSplitPercent] = useState(62);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const responseLanguageRef = useRef(language);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [pendingAudio, setPendingAudio] = useState<{
    url: string;
    durationMs: number;
    blob: Blob;
  } | null>(null);
  const messageAudioUrlsRef = useRef<Set<string>>(new Set());
  const voiceMetricsRef = useRef<VoiceDeliveryMetrics | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [coachMuted, setCoachMuted] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const {
    speak: speakCoach,
    stop: stopCoach,
    speakingPhase: coachSpeakingPhase,
    primeFromUserGesture,
    playPendingFromGesture,
  } = useVolcengineTts(language);
  const stopCoachRef = useRef(stopCoach);
  stopCoachRef.current = stopCoach;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const clearPendingAudio = useCallback(() => {
    setPendingAudio((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    voiceMetricsRef.current = null;
  }, []);

  useEffect(() => {
    const urls = messageAudioUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const handleRecordingComplete = useCallback(
    async (recording: PrepVoiceRecording) => {
      setPendingAudio((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return {
          url: recording.url,
          durationMs: recording.durationMs,
          blob: recording.blob,
        };
      });
      const transcript = draftRef.current;
      voiceMetricsRef.current = await buildVoiceDeliveryMetrics(
        recording.blob,
        transcript,
        recording.durationMs,
        resolvePrepResponseLanguage(language, transcript),
      );
      markRecordingComplete({
        durationMs: recording.durationMs,
        blobBytes: recording.blob.size,
        transcriptChars: transcript.length,
      });
    },
    [language],
  );

  const currentQuestion = questions[questionIndex] ?? null;
  const progress =
    questions.length > 0 ? ((questionIndex + 1) / questions.length) * 100 : 0;
  const bestScoreForCurrent = useMemo(() => {
    if (!currentQuestion) return null;
    const scores = attempts
      .filter((attempt) => attempt.questionId === currentQuestion.id)
      .map((attempt) => Number(attempt.score))
      .filter((score) => Number.isFinite(score));
    return scores.length > 0 ? Math.max(...scores) : null;
  }, [attempts, currentQuestion]);

  const coachSpeakingActive =
    mode === "VOICE" &&
    !coachMuted &&
    (coachSpeakingPhase === "loading" || coachSpeakingPhase === "playing");

  const coachSpeakingPhaseForUi: CoachSpeakingPhase | undefined =
    coachSpeakingActive
      ? (coachSpeakingPhase as CoachSpeakingPhase)
      : undefined;

  const getChatScrollViewport = useCallback((): HTMLElement | null => {
    for (const root of [desktopScrollAreaRef.current, mobileScrollAreaRef.current]) {
      if (!root) continue;
      const viewport = root.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (
        viewport instanceof HTMLElement &&
        viewport.offsetHeight > 0 &&
        viewport.offsetParent !== null
      ) {
        return viewport;
      }
    }
    return null;
  }, []);

  const scrollElementToTop = useCallback(
    (anchor: HTMLElement, behavior: ScrollBehavior = "smooth") => {
      const viewport = getChatScrollViewport();
      if (!viewport) {
        anchor.scrollIntoView({ block: "start", behavior, inline: "nearest" });
        return;
      }

      const content = viewport.firstElementChild;
      if (content instanceof HTMLElement) {
        let offset = 0;
        let node: HTMLElement | null = anchor;
        while (node && node !== content) {
          offset += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        if (node === content) {
          viewport.scrollTo({
            top: Math.max(0, offset - 20),
            behavior,
          });
          return;
        }
      }

      anchor.scrollIntoView({ block: "start", behavior, inline: "nearest" });
    },
    [getChatScrollViewport],
  );

  const resolveVisibleAnchor = useCallback(
    (nodes: HTMLDivElement[]) =>
      nodes.find((node) => node.offsetParent !== null) ?? nodes[0],
    [],
  );

  const resolveQuestionAnchor = useCallback(
    (index: number) => {
      const nodes = questionMessageRefs.current.get(index) ?? [];
      return resolveVisibleAnchor(nodes);
    },
    [resolveVisibleAnchor],
  );

  const resolveMessageAnchor = useCallback(
    (messageId: string) => {
      const nodes = messageAnchorRefs.current.get(messageId) ?? [];
      return resolveVisibleAnchor(nodes);
    },
    [resolveVisibleAnchor],
  );

  const scrollToQuestionMessage = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const run = (attempt = 0) => {
        const anchor = resolveQuestionAnchor(index);
        if (!anchor) {
          if (attempt < 12) requestAnimationFrame(() => run(attempt + 1));
          return;
        }
        scrollElementToTop(anchor, behavior);
      };
      run();
    },
    [resolveQuestionAnchor, scrollElementToTop],
  );

  const scrollToMessageTop = useCallback(
    (messageId: string, behavior: ScrollBehavior = "smooth") => {
      const run = (attempt = 0) => {
        const anchor = resolveMessageAnchor(messageId);
        if (!anchor) {
          if (attempt < 12) requestAnimationFrame(() => run(attempt + 1));
          return;
        }
        scrollElementToTop(anchor, behavior);
      };
      run();
    },
    [resolveMessageAnchor, scrollElementToTop],
  );

  const registerQuestionAnchor = useCallback(
    (index: number, node: HTMLDivElement | null) => {
      if (!node) return;
      const existing = questionMessageRefs.current.get(index) ?? [];
      if (!existing.includes(node)) {
        questionMessageRefs.current.set(index, [...existing, node]);
      }
    },
    [],
  );

  const registerMessageAnchor = useCallback(
    (messageId: string, node: HTMLDivElement | null) => {
      if (!node) return;
      const existing = messageAnchorRefs.current.get(messageId) ?? [];
      if (!existing.includes(node)) {
        messageAnchorRefs.current.set(messageId, [...existing, node]);
      }
    },
    [],
  );

  const waitAnimationFrames = useCallback(
    (count = 2) =>
      new Promise<void>((resolve) => {
        let remaining = count;
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [],
  );

  const [coachSpeakingTarget, setCoachSpeakingTarget] = useState<
    "question" | "feedback" | null
  >(null);
  const [coachFeedbackMessageId, setCoachFeedbackMessageId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (coachSpeakingPhase === "idle") {
      setCoachSpeakingTarget(null);
    }
  }, [coachSpeakingPhase]);

  const speakingQuestionIndex =
    coachSpeakingActive &&
    coachSpeakingTarget === "question" &&
    activePrompt?.kind === "question"
      ? activePrompt.questionIndex
      : null;

  const canGradeAi = true;
  const canHintAi = true;
  const coachQuestionsBlocked = false;
  const aiTokensBlocked = false;
  const composerAiTokens = undefined;
  const composerAiTokensBlocked = undefined;

  const speakCoachText = useCallback(
    (
      text: string,
      target: "question" | "feedback",
      feedbackMessageId?: string,
    ) => {
      if (mode !== "VOICE" || coachMuted || !text.trim()) return;
      if (target === "question" && coachQuestionsBlocked) return;
      setCoachSpeakingTarget(target);
      if (target === "feedback" && feedbackMessageId) {
        setCoachFeedbackMessageId(feedbackMessageId);
      } else if (target === "question") {
        setCoachFeedbackMessageId(null);
      }
      void speakCoach(text, responseLanguageRef.current, {
        truncate: target === "feedback",
      });
    },
    [coachMuted, coachQuestionsBlocked, mode, speakCoach],
  );

  const speakCoachTextRef = useRef(speakCoachText);

  useEffect(() => {
    speakCoachTextRef.current = speakCoachText;
  });

  const replayCurrentQuestion = useCallback(() => {
    const question = questions[questionIndex];
    if (!question?.text.trim()) return;
    primeFromUserGesture();
    speakCoachText(question.text, "question");
  }, [primeFromUserGesture, questionIndex, questions, speakCoachText]);

  const unlockCoachPlayback = useCallback(() => {
    playPendingFromGesture();
  }, [playPendingFromGesture]);

  const speakQuestionWithGesture = useCallback(
    (text: string) => {
      // Resume AudioContext in the same click event as navigation (sync call).
      primeFromUserGesture();
      speakCoachText(text, "question");
    },
    [primeFromUserGesture, speakCoachText],
  );

  const composerSessionActions = useMemo(
    () => ({
      showCoachMute: mode === "VOICE",
      coachMuted: coachMuted || coachQuestionsBlocked,
      coachDisabled: coachQuestionsBlocked,
      onToggleCoachMute: () => {
        if (coachQuestionsBlocked) return;
        setCoachMuted((m) => {
          if (m) {
            if (!playPendingFromGesture()) {
              replayCurrentQuestion();
            }
            return false;
          }
          stopCoachRef.current();
          return true;
        });
      },
      onFinish: () => setFinishDialogOpen(true),
      finishLoading: isFinishing,
      finishDisabled: submitting || isFinishing,
    }),
    [
      coachMuted,
      coachQuestionsBlocked,
      isFinishing,
      mode,
      playPendingFromGesture,
      replayCurrentQuestion,
      submitting,
    ],
  );

  useEffect(() => {
    if (coachMuted || coachQuestionsBlocked) stopCoachRef.current();
  }, [coachMuted, coachQuestionsBlocked]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSubmitting(false);
  };

  const sessionInitRef = useRef<string | null>(null);
  const sessionSpeakRef = useRef<string | null>(null);

  useEffect(() => {
    if (questions.length === 0 || !sessionId) return;

    if (sessionInitRef.current !== sessionId) {
      sessionInitRef.current = sessionId;
      sessionSpeakRef.current = null;

      const sessionAttempts = attempts.filter(
        (attempt) => attempt.sessionId === sessionId,
      );
      const resumeState = buildPracticeResumeState(questions, sessionAttempts);

      if (resumeState) {
        setQuestionIndex(resumeState.questionIndex);
        setMessages(resumeState.messages as ChatMessage[]);
        setActivePrompt(resumeState.activePrompt);
        setAwaitingRetry(resumeState.awaitingRetry);
        setPinnedQuestionIndex(resumeState.pinnedQuestionIndex);
        setPinnedMessageId(resumeState.pinnedMessageId);
        promptStartedAtRef.current = Date.now();
        sessionSpeakRef.current = sessionId;
        return;
      }

      const firstQuestion = questions[0];
      setQuestionIndex(0);
      setAwaitingRetry(false);
      setMessages([questionMessage(firstQuestion, 0)]);
      setActivePrompt({
        kind: "question",
        questionId: firstQuestion.id,
        questionIndex: 0,
        prompt: firstQuestion.text,
      });
      promptStartedAtRef.current = Date.now();
      setPinnedQuestionIndex(0);
      setPinnedMessageId(null);
    }
  }, [attempts, questions, sessionId]);

  useEffect(() => {
    if (
      !sessionId ||
      questions.length === 0 ||
      mode !== "VOICE" ||
      coachMuted ||
      coachQuestionsBlocked
    ) {
      return;
    }
    if (sessionSpeakRef.current === sessionId) return;

    const firstQuestion = questions[0];
    if (!firstQuestion?.text.trim()) return;

    let cancelled = false;
    let raf2 = 0;

    const speakFirstQuestion = () => {
      if (cancelled || sessionSpeakRef.current === sessionId) return;
      sessionSpeakRef.current = sessionId;
      speakCoachTextRef.current(firstQuestion.text, "question");
    };

    // Wait for layout/paint so the session UI is on screen, then auto-read Q1.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(speakFirstQuestion);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [coachMuted, coachQuestionsBlocked, mode, questions, sessionId]);

  useEffect(() => {
    if (mode !== "VOICE" || coachMuted) return;
    const onGesture = () => {
      playPendingFromGesture();
    };
    document.addEventListener("pointerdown", onGesture, { capture: true });
    document.addEventListener("keydown", onGesture, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onGesture, { capture: true });
      document.removeEventListener("keydown", onGesture, { capture: true });
    };
  }, [coachMuted, mode, playPendingFromGesture]);

  const questionScrollTarget =
    pinnedQuestionIndex ?? speakingQuestionIndex;

  useLayoutEffect(() => {
    if (questionScrollTarget !== null) {
      const snapToQuestion =
        pinnedQuestionIndex !== null &&
        lastPinnedQuestionScrollRef.current !== pinnedQuestionIndex;
      if (snapToQuestion) {
        lastPinnedQuestionScrollRef.current = pinnedQuestionIndex;
      }
      scrollToQuestionMessage(
        questionScrollTarget,
        snapToQuestion ? "auto" : "smooth",
      );
      return;
    }
    lastPinnedQuestionScrollRef.current = null;

    if (pinnedMessageId) {
      lastPinnedMessageScrollRef.current = pinnedMessageId;
      // Always align to the top of the pinned message (instant keeps long cards readable).
      scrollToMessageTop(pinnedMessageId, "auto");
      return;
    }
    lastPinnedMessageScrollRef.current = null;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.kind !== "system") {
      scrollToMessageTop(lastMessage.id, "smooth");
    }
  }, [
    messages,
    draft,
    submitting,
    questionIndex,
    pinnedQuestionIndex,
    pinnedMessageId,
    questionScrollTarget,
    scrollToMessageTop,
    scrollToQuestionMessage,
  ]);

  const updateMessage = (messageId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? ({ ...message, ...patch } as ChatMessage)
          : message,
      ),
    );
  };

  const handleError = (title: string, err: unknown) => {
    const message = err instanceof Error ? err.message : title;
    toast({
      title,
      description: message,
      variant: "destructive",
    });
  };

  const ensureQuestionInThread = (index: number) => {
    setMessages((prev) => {
      const exists = prev.some(
        (message) =>
          message.kind === "question" && message.questionIndex === index,
      );
      if (exists) return prev;
      const question = questions[index];
      if (!question) return prev;
      return [...prev, questionMessage(question, index)];
    });
  };

  const navigateToQuestion = (index: number) => {
    if (index < 0 || index >= questions.length || submitting) return;
    const question = questions[index];
    if (!question) return;

    stopGeneration();
    setQuestionIndex(index);
    setDraft("");
    setAwaitingRetry(false);
    clearPendingAudio();
    ensureQuestionInThread(index);
    setActivePrompt({
      kind: "question",
      questionId: question.id,
      questionIndex: index,
      prompt: question.text,
    });
    promptStartedAtRef.current = Date.now();
    setPinnedMessageId(null);
    setPinnedQuestionIndex(index);
    speakQuestionWithGesture(question.text);
  };

  const submitQuestionAnswer = async (
    prompt: Extract<ActivePrompt, { kind: "question" }>,
    answerText: string,
    answerMessageId: string,
    voiceMetrics?: VoiceDeliveryMetrics | null,
    answerAudioBlob?: Blob | null,
  ) => {
    const feedbackId = id();
    setPinnedMessageId(feedbackId);
    let streamingAccumulator = "";
    let feedbackFinalHandled = false;

    const finishFeedbackFromServer = (rawFeedback: PrepFeedback) => {
      if (feedbackFinalHandled) return;
      feedbackFinalHandled = true;
      const feedback = normalizeFeedback(rawFeedback);
      updateMessage(feedbackId, {
        feedback,
        feedbackPartial: false,
        phase: "idle",
        thinkingText: undefined,
        streamingText: undefined,
      } as Partial<ChatMessage>);
      markPrepFeedbackDiag("final_sse_received");
      onAttemptCreated();
      setActivePrompt({
        kind: "question",
        questionId: prompt.questionId,
        questionIndex: prompt.questionIndex,
        prompt: prompt.prompt,
      });
      promptStartedAtRef.current = Date.now();
      setAwaitingRetry(true);
      setPinnedMessageId(feedbackId);

      const feedbackSpeech = prepareCoachTtsText(
        [feedback.verdict, feedback.summary].filter(Boolean).join(". "),
      );
      void waitAnimationFrames(2).then(() => {
        primeFromUserGesture();
        speakCoachText(feedbackSpeech, "feedback", feedbackId);
      });
    };

    setMessages((prev) => [
      ...prev,
      {
        id: feedbackId,
        role: "assistant",
        kind: "feedback",
        phase: "thinking",
        thinkingText: "",
        streamingText: "",
      },
    ]);
    markPrepFeedbackDiag("feedback_card_shown");

    const abort = new AbortController();
    abortRef.current = abort;

    responseLanguageRef.current = resolvePrepResponseLanguage(
      language,
      answerText,
    );

    let final: FeedbackFinal | null = null;
    try {
      const metadata = {
        sessionId,
        questionId: prompt.questionId,
        answerText,
        inputMode: mode,
        practiceMode: true,
        durationSeconds: Math.round(
          (Date.now() - promptStartedAtRef.current) / 1000,
        ),
        voiceMetrics: voiceMetrics
          ? {
              durationSeconds: voiceMetrics.durationSeconds,
              wordsPerMinute: voiceMetrics.wordsPerMinute,
              confidence: voiceMetrics.confidence,
              clarity: voiceMetrics.clarity,
              tone: voiceMetrics.tone,
              tips: voiceMetrics.tips,
            }
          : undefined,
        answerAudioMimeType: answerAudioBlob?.type || "audio/webm",
        diagTraceId: getPrepFeedbackDiagTraceId() ?? undefined,
      };

      let response: Response;
      if (answerAudioBlob && answerAudioBlob.size > 0) {
        markPrepFeedbackDiag("fetch_start", {
          multipart: true,
          blobBytes: answerAudioBlob.size,
          answerChars: answerText.length,
        });
        const form = new FormData();
        form.append("metadata", JSON.stringify(metadata));
        form.append("audio", answerAudioBlob, "answer.webm");
        response = await fetch("/api/prep/feedback", {
          method: "POST",
          body: form,
          signal: abort.signal,
        });
      } else {
        markPrepFeedbackDiag("fetch_start", {
          multipart: false,
          answerChars: answerText.length,
        });
        response = await fetch("/api/prep/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
          signal: abort.signal,
        });
      }
      markPrepFeedbackDiag("fetch_response", { status: response.status });

      final = await readPrepStream<FeedbackFinal>(
        response,
        (token) => {
          streamingAccumulator += token;
          const partial = parsePartialPrepFeedback(streamingAccumulator);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== feedbackId || m.kind !== "feedback") return m;
              const nextFeedback = partial
                ? normalizeFeedback({
                    ...(m.feedback ?? EMPTY_FEEDBACK),
                    ...partial,
                  })
                : m.feedback;
              return {
                ...m,
                phase: "writing",
                streamingText: streamingAccumulator,
                feedback: nextFeedback,
                feedbackPartial: Boolean(partial),
              };
            }),
          );
        },
        {
          signal: abort.signal,
          onFirstByte: () => markPrepFeedbackDiag("first_sse_byte"),
          onFirstThinking: () => markPrepFeedbackDiag("first_thinking_sse"),
          onFirstToken: () => markPrepFeedbackDiag("first_content_token"),
          onFinal: (payload) => {
            if (payload.feedback) {
              finishFeedbackFromServer(payload.feedback);
            }
          },
          onPersistWarning: (message) => {
            toast({
              title: "Could not save attempt",
              description: message,
              variant: "destructive",
            });
          },
          onPersisted: ({ audioUrl, audioCreatedAt, audioDurationSeconds }) => {
            if (!audioUrl) return;
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id !== answerMessageId || message.kind !== "answer") {
                  return message;
                }
                if (
                  message.audioUrl?.startsWith("blob:") &&
                  message.audioUrl !== audioUrl
                ) {
                  URL.revokeObjectURL(message.audioUrl);
                  messageAudioUrlsRef.current.delete(message.audioUrl);
                }
                return {
                  ...message,
                  audioUrl,
                  audioDurationMs:
                    audioDurationSeconds != null
                      ? Math.floor(audioDurationSeconds * 1000)
                      : message.audioDurationMs,
                  audioCreatedAt:
                    audioCreatedAt ??
                    message.audioCreatedAt ??
                    new Date().toISOString(),
                };
              }),
            );
          },
          onThinking: (text) => {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== feedbackId || m.kind !== "feedback") return m;
                return {
                  ...m,
                  phase: "thinking",
                  thinkingText: `${m.thinkingText ?? ""}${text}`,
                };
              }),
            );
          },
        },
      );
    } catch (err) {
      if (isAbortError(err)) {
        abortPrepFeedbackDiag();
        setMessages((prev) => prev.filter((m) => m.id !== feedbackId));
        setPinnedMessageId(null);
        return;
      }
      const message = err instanceof Error ? err.message : "Feedback failed";
      updateMessage(feedbackId, {
        kind: "error",
        content: message,
      } as Partial<ChatMessage>);
      throw err;
    }

    if (!feedbackFinalHandled) {
      if (!final?.feedback) {
        throw new Error("Feedback stream ended without a final payload");
      }
      finishFeedbackFromServer(final.feedback);
    }

    finishPrepFeedbackDiag({
      score: normalizeFeedback(final?.feedback).score,
    });
  };

  const submitDraft = async (ctx?: { recording?: PrepVoiceRecording | null }) => {
    const answerText = draft.trim();
    if (!activePrompt || submitting) return;
    if (answerText.length < 8) return;

    setSubmitting(true);
    setPinnedQuestionIndex(null);
    startPrepFeedbackDiag(sessionId, activePrompt.questionId);
    const recording = ctx?.recording;
    const audioBlob = recording?.blob ?? pendingAudio?.blob;
    let audioDurationMs =
      recording?.durationMs ?? pendingAudio?.durationMs ?? 0;
    if (audioBlob && audioBlob.size > 0) {
      const blobDurationSeconds = await resolveBlobDuration(audioBlob);
      if (blobDurationSeconds != null) {
        audioDurationMs = blobDurationSeconds * 1000;
      }
    }
    let messageAudioUrl: string | undefined;
    if (audioBlob && audioBlob.size > 0) {
      messageAudioUrl = URL.createObjectURL(audioBlob);
      messageAudioUrlsRef.current.add(messageAudioUrl);
    }
    if (recording?.url) URL.revokeObjectURL(recording.url);
    let metrics = voiceMetricsRef.current;
    if (audioBlob && !metrics) {
      markPrepFeedbackDiag("metrics_start", { blobBytes: audioBlob.size });
      metrics = await buildVoiceDeliveryMetrics(
        audioBlob,
        answerText,
        audioDurationMs,
        resolvePrepResponseLanguage(language, answerText),
      );
      markPrepFeedbackDiag("metrics_done");
    }
    setDraft("");
    setPendingAudio((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    voiceMetricsRef.current = null;

    const answerMessageId = id();
    setPinnedMessageId(answerMessageId);
    setMessages((prev) => [
      ...prev,
      {
        id: answerMessageId,
        role: "user",
        kind: "answer",
        content: answerText,
        mode,
        audioUrl: messageAudioUrl,
        audioDurationMs: messageAudioUrl ? audioDurationMs : undefined,
        audioCreatedAt: messageAudioUrl ? new Date().toISOString() : undefined,
      },
    ]);
    markPrepFeedbackDiag("user_message_shown", { mode, hasAudio: Boolean(messageAudioUrl) });

    try {
      await submitQuestionAnswer(
        activePrompt,
        answerText,
        answerMessageId,
        metrics,
        audioBlob && audioBlob.size > 0 ? audioBlob : null,
      );
    } catch (err) {
      if (isAbortError(err)) return;
      abortPrepFeedbackDiag();
      setActivePrompt(activePrompt);
      handleError("Feedback failed", err);
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  const handleSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(pct, 35), 78));
    };
    const onPointerUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No questions are available for this practice session.
      </div>
    );
  }

  const currentPromptText = activePrompt?.prompt ?? currentQuestion?.text ?? "";

  const composerVoice =
    mode === "VOICE"
      ? {
          language,
          disabled: !activePrompt,
          pendingAudioUrl: pendingAudio?.url ?? null,
          pendingAudioDurationMs: pendingAudio?.durationMs,
          onRecordingComplete: handleRecordingComplete,
          onClearPendingAudio: clearPendingAudio,
          onBeforeVoiceStart: unlockCoachPlayback,
        }
      : undefined;

  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-background">
      <header className="shrink-0 border-b bg-card px-3 py-2 md:px-6 md:py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{interviewTitle}</h2>
              <Badge variant="secondary" className="gap-1">
                {mode === "VOICE" ? (
                  <Mic className="h-3 w-3" />
                ) : (
                  <MessageSquareText className="h-3 w-3" />
                )}
                {mode}
              </Badge>
              <Badge variant="outline">AI coach</Badge>
              {bestScoreForCurrent !== null ? (
                <Badge variant="outline" className="gap-1">
                  <Target className="h-3 w-3" />
                  Best {bestScoreForCurrent.toFixed(1)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Voice practice with feedback after every answer
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1">
              <span className="h-2 w-2 rounded-full bg-primary-foreground" />
              Connected
            </Badge>
            {remainingSeconds !== null ? (
              <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
                <Timer className="h-4 w-4" />
                {formatMinutes(remainingSeconds)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Q{questionIndex + 1} / {questions.length}
          </span>
        </div>
        {currentPromptText ? (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
            {currentPromptText}
          </p>
        ) : null}
      </header>

      <div
        ref={splitContainerRef}
        className="hidden min-h-0 flex-1 overflow-hidden lg:flex"
      >
        <section
          className="relative flex min-h-0 min-w-0 shrink-0 flex-col"
          style={{ width: `${splitPercent}%`, minWidth: 320 }}
        >
          <ScrollArea ref={desktopScrollAreaRef} className="flex-1">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8 pb-36">
              {messages.map((message) => (
                <ChatMessageView
                  key={message.id}
                  message={message}
                  inputMode={mode}
                  speakingQuestionIndex={speakingQuestionIndex}
                  registerQuestionAnchor={registerQuestionAnchor}
                  registerMessageAnchor={registerMessageAnchor}
                  coachSpeakingActive={coachSpeakingActive}
                  coachSpeakingTarget={coachSpeakingTarget}
                  coachFeedbackMessageId={coachFeedbackMessageId}
                  coachSpeakingPhase={coachSpeakingPhaseForUi}
                  planTier={planTier}
                  mediaRetentionDays={mediaRetentionDays}
                />
              ))}
              <div ref={scrollEndRef} aria-hidden />
            </div>
          </ScrollArea>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-4 pt-10">
            <div className="pointer-events-auto mx-auto w-full max-w-4xl">
              <ChatComposer
                className="border bg-card/95 shadow-lg backdrop-blur-sm"
                value={draft}
                onChange={setDraft}
                onSubmit={submitDraft}
                onStop={stopGeneration}
                isGenerating={submitting}
                disabled={!activePrompt || aiTokensBlocked}
                submitDisabled={
                  !activePrompt ||
                  aiTokensBlocked ||
                  !canGradeAi ||
                  draft.trim().length < 8
                }
                minLength={8}
                placeholder={
                  aiTokensBlocked
                    ? "Answer submission is unavailable right now..."
                    : !activePrompt
                      ? "Select a question to continue..."
                      : awaitingRetry
                        ? "Revise your answer using the feedback, then send again..."
                        : mode === "VOICE"
                          ? "Speak or edit your transcript..."
                          : "Type your answer..."
                }
                questionNav={{
                  onBeforeNavigate: primeFromUserGesture,
                  onPrevious: () => navigateToQuestion(questionIndex - 1),
                  onNext: () => navigateToQuestion(questionIndex + 1),
                  canPrevious: questionIndex > 0,
                  canNext: questionIndex < questions.length - 1,
                  disabled: submitting,
                }}
                voice={composerVoice}
                sessionActions={composerSessionActions}
                aiTokenBalance={composerAiTokens}
                aiTokensBlocked={composerAiTokensBlocked}
              />
            </div>
          </div>

          <AlertDialog open={finishDialogOpen} onOpenChange={setFinishDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finish practice?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your progress will be saved. You can start another practice session
                  later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isFinishing}>Keep practicing</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isFinishing}
                  onClick={(event) => {
                    event.preventDefault();
                    onFinish();
                  }}
                >
                  {isFinishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Finish practice"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <div
          className="group flex w-1 shrink-0 cursor-col-resize touch-none items-center justify-center border-l border-r border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
          onPointerDown={handleSplitPointerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
        />

        <aside className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/20">
          <PrepSuggestedAnswerPanel
            interviewId={interviewId}
            questionId={currentQuestion?.id ?? null}
            questionType={currentQuestion?.type ?? null}
            hasContext={hasContext}
            prepContext={prepContext}
            onContextSaved={onPrepContextSaved}
            canUseHint={canHintAi}
          />
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <section className="relative flex min-h-0 flex-1 flex-col">
          <ScrollArea ref={mobileScrollAreaRef} className="flex-1">
            <div className="flex flex-col gap-5 px-4 py-6 pb-36">
              {messages.map((message) => (
                <ChatMessageView
                  key={message.id}
                  message={message}
                  inputMode={mode}
                  speakingQuestionIndex={speakingQuestionIndex}
                  registerQuestionAnchor={registerQuestionAnchor}
                  registerMessageAnchor={registerMessageAnchor}
                  coachSpeakingActive={coachSpeakingActive}
                  coachSpeakingTarget={coachSpeakingTarget}
                  coachFeedbackMessageId={coachFeedbackMessageId}
                  coachSpeakingPhase={coachSpeakingPhaseForUi}
                  planTier={planTier}
                  mediaRetentionDays={mediaRetentionDays}
                />
              ))}
              <div ref={scrollEndRef} aria-hidden />
            </div>
          </ScrollArea>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-8">
            <div className="pointer-events-auto">
              <ChatComposer
                className="border bg-card/95 shadow-lg backdrop-blur-sm"
                value={draft}
                onChange={setDraft}
                onSubmit={submitDraft}
                onStop={stopGeneration}
                isGenerating={submitting}
                disabled={!activePrompt || aiTokensBlocked}
                submitDisabled={
                  !activePrompt ||
                  aiTokensBlocked ||
                  !canGradeAi ||
                  draft.trim().length < 8
                }
                minLength={8}
                placeholder={
                  aiTokensBlocked
                    ? "Answer submission is unavailable right now..."
                    : !activePrompt
                      ? "Select a question to continue..."
                      : awaitingRetry
                        ? "Revise your answer using the feedback, then send again..."
                        : mode === "VOICE"
                          ? "Speak or edit your transcript..."
                          : "Type your answer..."
                }
                questionNav={{
                  onBeforeNavigate: primeFromUserGesture,
                  onPrevious: () => navigateToQuestion(questionIndex - 1),
                  onNext: () => navigateToQuestion(questionIndex + 1),
                  canPrevious: questionIndex > 0,
                  canNext: questionIndex < questions.length - 1,
                  disabled: submitting,
                }}
                voice={composerVoice}
                sessionActions={composerSessionActions}
                aiTokenBalance={composerAiTokens}
                aiTokensBlocked={composerAiTokensBlocked}
              />
            </div>
          </div>
        </section>
        <aside className="flex max-h-[40vh] min-h-0 shrink-0 flex-col border-t bg-muted/20">
          <PrepSuggestedAnswerPanel
            interviewId={interviewId}
            questionId={currentQuestion?.id ?? null}
            questionType={currentQuestion?.type ?? null}
            hasContext={hasContext}
            prepContext={prepContext}
            onContextSaved={onPrepContextSaved}
            canUseHint={canHintAi}
          />
        </aside>
      </div>
    </div>
  );
}

function PrepAnswerAudioPlayer({
  audioUrl,
  audioDurationMs,
  audioCreatedAt,
  planTier,
}: {
  audioUrl: string;
  audioDurationMs?: number;
  audioCreatedAt?: string;
  planTier: PlanTier;
}) {
  const retention = audioCreatedAt
    ? computeMediaRetention(audioCreatedAt, planTier, true)
    : null;
  const durationLabel =
    audioDurationMs && audioDurationMs > 0
      ? formatPrepAudioDuration(audioDurationMs / 1000)
      : null;

  return (
    <div className="mt-2">
      <div className="flex min-w-0 items-center gap-2">
        <audio
          controls
          src={audioUrl}
          className="h-8 min-w-0 flex-1 max-w-md"
          preload="metadata"
        />
        {durationLabel ? (
          <span className="flex shrink-0 items-center gap-1">
            <span
              className="tabular-nums text-xs font-medium opacity-80"
              aria-label={`Recording length ${durationLabel}`}
            >
              {durationLabel}
            </span>
            {retention?.expiresSoon ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex rounded-sm text-white/80 transition-colors hover:text-white"
                    aria-label={`Audio will be auto-deleted in ${retention.daysRemaining} days`}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  Audio will be auto-deleted in {retention.daysRemaining} days.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ChatMessageView({
  message,
  inputMode = "TEXT",
  speakingQuestionIndex = null,
  registerQuestionAnchor,
  registerMessageAnchor,
  coachSpeakingActive = false,
  coachSpeakingTarget = null,
  coachFeedbackMessageId = null,
  coachSpeakingPhase,
  planTier = "Self-hosted",
  mediaRetentionDays = 7,
}: {
  message: ChatMessage;
  inputMode?: Mode;
  speakingQuestionIndex?: number | null;
  registerQuestionAnchor?: (index: number, node: HTMLDivElement | null) => void;
  registerMessageAnchor?: (messageId: string, node: HTMLDivElement | null) => void;
  coachSpeakingActive?: boolean;
  coachSpeakingTarget?: "question" | "feedback" | null;
  coachFeedbackMessageId?: string | null;
  coachSpeakingPhase?: CoachSpeakingPhase;
  planTier?: PlanTier;
  mediaRetentionDays?: number;
}) {
  if (message.role === "system") {
    return (
      <div className="mx-auto rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";
  const isSpeakingQuestion =
    message.kind === "question" &&
    speakingQuestionIndex !== null &&
    message.questionIndex === speakingQuestionIndex;
  const questionCoachActive =
    isSpeakingQuestion && coachSpeakingActive && !isUser;
  const showQuestionWave = isSpeakingQuestion && coachSpeakingActive;
  const feedbackCoachActive =
    message.kind === "feedback" &&
    coachSpeakingActive &&
    coachSpeakingTarget === "feedback" &&
    message.id === coachFeedbackMessageId &&
    !isUser;

  const isWideCard =
    message.kind === "feedback" || message.kind === "refinement";
  /** Glow wrapper only for question TTS; feedback keeps one card shell in FeedbackCard. */
  const messageGlowActive = questionCoachActive;

  const cardInner = (
    <div
      className={cn(
        "text-sm transition-shadow",
        questionCoachActive && "px-4 py-3 text-card-foreground",
        !messageGlowActive &&
          !isWideCard &&
          "max-w-[92%] rounded-lg px-4 py-3",
        !messageGlowActive &&
          !isWideCard &&
          isUser &&
          "bg-primary text-primary-foreground",
        !messageGlowActive &&
          !isWideCard &&
          !isUser &&
          "border bg-card text-card-foreground max-w-[92%]",
        isWideCard && "w-full max-w-none",
        messageGlowActive &&
          !isWideCard &&
          "w-full rounded-lg px-4 py-3 text-card-foreground",
      )}
    >
        {message.kind === "intro" ? (
          <p className="leading-relaxed">{message.content}</p>
        ) : null}
        {message.kind === "question" ? (
          <QuestionBubble
            content={message.content}
            questionIndex={message.questionIndex}
            questionType={message.questionType}
            showCoachWave={showQuestionWave}
            coachSpeakingPhase={coachSpeakingPhase}
          />
        ) : null}
        {message.kind === "followup" ? (
          <FollowUpBubble content={message.content} />
        ) : null}
        {message.kind === "error" ? (
          <p className="leading-relaxed text-destructive">{message.content}</p>
        ) : null}
        {message.kind === "answer" ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
              {message.mode === "VOICE" ? (
                <Mic className="h-3 w-3" />
              ) : (
                <MessageSquareText className="h-3 w-3" />
              )}
              Your answer
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            {message.audioUrl ? (
              <PrepAnswerAudioPlayer
                audioUrl={message.audioUrl}
                audioDurationMs={message.audioDurationMs}
                audioCreatedAt={message.audioCreatedAt}
                planTier={planTier}
              />
            ) : message.mode === "VOICE" &&
              message.audioCreatedAt &&
              computeMediaRetention(
                message.audioCreatedAt,
                planTier,
                true,
              ).expired ? (
              <p className="mt-2 text-xs opacity-80">
                Audio recording removed after {mediaRetentionDays} days.
              </p>
            ) : null}
          </div>
        ) : null}
        {message.kind === "feedback" ? (
          message.feedback && hasPartialFeedbackHeader(message.feedback) ? (
            <FeedbackCard
              feedback={normalizeFeedback(message.feedback)}
              partial={message.feedbackPartial}
              coachSpeaking={feedbackCoachActive}
              coachSpeakingPhase={coachSpeakingPhase}
            />
          ) : (
            <StreamingFeedback
              phase={message.phase}
              thinkingText={message.thinkingText}
              streamingText={message.streamingText}
              inputMode={inputMode}
            />
          )
        ) : null}
        {message.kind === "refinement" ? (
          message.refinement ? (
            <RefinementCard refinement={message.refinement} />
          ) : (
            <StreamingFeedback
              phase={message.phase}
              thinkingText={message.thinkingText}
              streamingText={message.streamingText}
              inputMode={inputMode}
            />
          )
        ) : null}
    </div>
  );

  return (
    <div
      ref={(node) => {
        registerMessageAnchor?.(message.id, node);
        if (message.kind === "question" && message.questionIndex !== undefined) {
          registerQuestionAnchor?.(message.questionIndex, node);
        }
      }}
      className={cn(
        "flex",
        message.kind === "question" && "scroll-mt-6",
        isWideCard && "scroll-mt-4",
        isUser && "justify-end",
      )}
    >
      {messageGlowActive ? (
        <AiGlowBorder
          active
          className={cn(
            isWideCard ? "w-full max-w-none" : "w-fit max-w-[92%]",
          )}
          roundedClassName={isWideCard ? "rounded-xl" : "rounded-lg"}
          innerClassName={cn(
            isWideCard ? "w-full overflow-hidden" : "w-full min-w-0",
          )}
        >
          {cardInner}
        </AiGlowBorder>
      ) : (
        cardInner
      )}
    </div>
  );
}

function QuestionBubble({
  content,
  questionIndex,
  questionType,
  showCoachWave = false,
  coachSpeakingPhase,
}: {
  content: string;
  questionIndex?: number;
  questionType?: string;
  showCoachWave?: boolean;
  coachSpeakingPhase?: CoachSpeakingPhase;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-10 items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Question {(questionIndex ?? 0) + 1}</Badge>
          <Badge variant="outline">{questionType}</Badge>
        </div>
        <div className="ml-auto flex h-10 w-[152px] shrink-0 items-center justify-end">
          {showCoachWave && coachSpeakingPhase ? (
            <CoachSpeakingWave phase={coachSpeakingPhase} />
          ) : null}
        </div>
      </div>
      <p className="text-base font-medium leading-relaxed">{content}</p>
    </div>
  );
}

function FollowUpBubble({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" />
        Coaching follow-up
      </div>
      <p className="text-base font-medium leading-relaxed">{content}</p>
    </div>
  );
}

function FeedbackCardShell({
  coachSpeaking = false,
  children,
}: {
  coachSpeaking?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl shadow-sm",
        coachSpeaking ? "ai-border-spin p-[1.5px]" : "border border-border bg-card",
      )}
    >
      <div className="relative overflow-hidden rounded-[10px] bg-card">
        {children}
      </div>
    </div>
  );
}

function StreamingFeedback({
  phase = "thinking",
  thinkingText = "",
  streamingText = "",
  inputMode = "TEXT",
}: {
  phase?: Phase;
  thinkingText?: string;
  streamingText?: string;
  inputMode?: Mode;
}) {
  const [gradingStep, setGradingStep] = useState(0);

  useEffect(() => {
    if (phase !== "thinking" || !thinkingText.trim()) {
      setGradingStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setGradingStep((step) => step + 1);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phase, thinkingText]);

  const gradingLabels =
    inputMode === "VOICE"
      ? [
          "Analyzing delivery & tone",
          "Matching answer to role requirements",
          "Generating coaching feedback",
        ]
      : [
          "Matching answer to role requirements",
          "Scoring key signals",
          "Generating coaching feedback",
        ];

  const showCompactGrading =
    phase === "thinking" &&
    Boolean(thinkingText.trim()) &&
    !Boolean(streamingText.trim());

  if (showCompactGrading) {
    return (
      <FeedbackCardShell>
        <div className="flex items-center gap-4 border-b bg-gradient-to-br from-primary/10 via-background to-muted/20 px-5 py-4">
          <ScoreRingSkeleton />
          <div className="min-w-0 flex-1 space-y-2">
            <div
              key={gradingStep}
              className="animate-in fade-in flex items-center gap-2 text-sm font-medium duration-300"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              {gradingLabels[gradingStep % gradingLabels.length]}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {inputMode === "VOICE"
                ? "Reviewing your recording and transcript before scoring."
                : "Reviewing your answer before scoring."}
            </p>
          </div>
        </div>
      </FeedbackCardShell>
    );
  }

  const hasPanels = Boolean(thinkingText || streamingText);

  return (
    <FeedbackCardShell>
      <div className="p-5">
        {hasPanels ? (
          <StreamingTextPanels
            phase={phase}
            thinkingText={thinkingText}
            contentText={streamingText}
            thinkingLabel="Reading your answer"
            thinkingCompleteLabel="Analysis complete"
            contentLabel="Drafting feedback"
            contentCompleteLabel="Finalizing feedback"
          />
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>{feedbackPhaseLabel(phase)}</span>
          </div>
        )}
      </div>
    </FeedbackCardShell>
  );
}

function hasFeedbackDetails(feedback: PrepFeedback): boolean {
  return (
    feedback.strengths.length > 0 ||
    feedback.improvements.length > 0 ||
    feedback.missingSignals.length > 0 ||
    feedback.resumeLeverage.length > 0 ||
    Boolean(feedback.voiceDelivery) ||
    Boolean(feedback.structureSuggestion?.trim()) ||
    feedback.needsUserVerification.length > 0 ||
    Boolean(feedback.followUpQuestion?.trim()) ||
    Boolean(feedback.sampleAnswer?.trim())
  );
}

function FeedbackCard({
  feedback,
  partial = false,
  coachSpeaking = false,
  coachSpeakingPhase,
}: {
  feedback: PrepFeedback;
  partial?: boolean;
  coachSpeaking?: boolean;
  coachSpeakingPhase?: CoachSpeakingPhase;
}) {
  const showDetails = !partial || hasFeedbackDetails(feedback);
  const showPartialDetailsLoading = partial && !hasFeedbackDetails(feedback);

  return (
    <FeedbackCardShell coachSpeaking={coachSpeaking}>
      <div className="relative border-b bg-gradient-to-br from-primary/10 via-background to-muted/20 px-5 py-4">
        {coachSpeaking && coachSpeakingPhase ? (
          <div className="pointer-events-none absolute right-4 top-3 z-10 flex h-10 w-[152px] items-start justify-end">
            <CoachSpeakingWave phase={coachSpeakingPhase} />
          </div>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {partial ? <ScoreRingSkeleton /> : <ScoreRing score={feedback.score} />}
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className={cn(
                "flex min-h-10 flex-wrap items-center gap-2 pr-[168px] sm:pr-0",
              )}
            >
              <h3 className="text-lg font-semibold tracking-tight">
                {feedback.verdict}
              </h3>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Coach feedback
              </Badge>
            </div>
            <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-sm leading-relaxed text-foreground/90">
              {feedback.summary}
            </p>
            {showPartialDetailsLoading ? (
              <div className="flex items-center gap-2 border-t border-primary/10 pt-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                Building detailed coaching…
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showDetails ? (
      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <SignalCard
            title="What worked"
            items={feedback.strengths}
            tone="positive"
            icon={CheckCircle2}
          />
          <SignalCard
            title="Improve next"
            items={feedback.improvements}
            tone="action"
            icon={TrendingUp}
          />
          <SignalCard
            title="Missing signals"
            items={feedback.missingSignals}
            tone="neutral"
            icon={Target}
          />
          <SignalCard
            title="Resume leverage"
            items={feedback.resumeLeverage}
            tone="neutral"
            icon={Sparkles}
          />
        </div>

        {feedback.voiceDelivery ? (
          <VoiceDeliveryPanel delivery={feedback.voiceDelivery} />
        ) : null}

        {feedback.structureSuggestion ? (
          <div className="rounded-lg border bg-muted/25 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-primary" />
              Structure to try
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {feedback.structureSuggestion}
            </p>
          </div>
        ) : null}

        {feedback.needsUserVerification.length > 0 ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-medium">Verify before using</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {feedback.needsUserVerification.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      ) : null}
    </FeedbackCardShell>
  );
}

function ScoreRingSkeleton() {
  const sizeClass = "h-[4.5rem] w-[4.5rem] rounded-2xl";
  const insetClass = "inset-[5px] rounded-[calc(1rem-5px)]";

  return (
    <div className={cn("relative shrink-0", sizeClass)} role="status" aria-label="Calculating score">
      <div
        className={cn("absolute inset-0", sizeClass)}
        style={{
          background: "conic-gradient(hsl(var(--muted)) 100%)",
        }}
      />
      <div
        className={cn(
          "absolute inset-0 animate-score-ring-pulse will-change-[opacity]",
          sizeClass,
        )}
        style={{
          background:
            "conic-gradient(hsl(var(--primary)) 30%, hsl(var(--muted)) 30%)",
        }}
      />
      <div
        className={cn(
          "absolute flex flex-col items-center justify-center bg-background",
          insetClass,
        )}
      >
        <span className="text-lg font-semibold leading-none text-muted-foreground/50">
          —
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/45">
          /10
        </span>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score * 10));
  return (
    <div
      className={cn(
        "relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl",
        scoreTone(score),
      )}
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)`,
      }}
    >
      <div className="absolute inset-[5px] flex flex-col items-center justify-center rounded-[calc(1rem-5px)] bg-background">
        <span className="text-2xl font-bold leading-none">{score}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          /10
        </span>
      </div>
    </div>
  );
}

function VoiceDeliveryPanel({
  delivery,
}: {
  delivery: NonNullable<PrepFeedback["voiceDelivery"]>;
}) {
  const metrics = [
    { label: "Confidence", value: delivery.confidence, hint: "Volume & steadiness" },
    { label: "Clarity", value: delivery.clarity, hint: "Pace & articulation" },
    { label: "Tone", value: delivery.tone, hint: "Energy & variation" },
  ] as const;

  return (
    <div className="rounded-lg border border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-background p-4 dark:border-violet-900/40 dark:from-violet-950/25">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Waves className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        Voice delivery
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value, hint }) => (
          <div key={label} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className={cn("text-sm font-bold tabular-nums", scoreTone(value))}>
                {value}/10
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  value >= 7
                    ? "bg-emerald-500"
                    : value >= 5
                      ? "bg-amber-500"
                      : "bg-orange-500",
                )}
                style={{ width: `${value * 10}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>
      {delivery.tips.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-violet-200/50 pt-3 dark:border-violet-900/30">
          {delivery.tips.map((tip) => (
            <li
              key={tip}
              className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
            >
              <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SignalCard({
  title,
  items,
  tone,
  icon: Icon,
}: {
  title: string;
  items: string[];
  tone: "positive" | "action" | "neutral";
  icon: typeof CheckCircle2;
}) {
  const styles = {
    positive:
      "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    action:
      "border-orange-200/70 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-950/20",
    neutral: "border-border/80 bg-muted/20",
  }[tone];
  const iconColor = {
    positive: "text-emerald-600 dark:text-emerald-400",
    action: "text-orange-600 dark:text-orange-400",
    neutral: "text-primary",
  }[tone];

  return (
    <div className={cn("rounded-lg border p-4", styles)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconColor)} />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="text-sm leading-relaxed text-muted-foreground before:mr-2 before:text-muted-foreground/50 before:content-['•']"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No items yet.</p>
      )}
    </div>
  );
}

function SignalList({ title, items }: { title: string; items: string[] }) {
  return (
    <SignalCard title={title} items={items} tone="neutral" icon={CheckCircle2} />
  );
}


function RefinementCard({
  refinement,
}: {
  refinement: {
    verdict: string;
    stillStrong: string[];
    stillMissing: string[];
  };
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        {refinement.verdict}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SignalList title="Still strong" items={refinement.stillStrong} />
        <SignalList title="Still missing" items={refinement.stillMissing} />
      </div>
    </div>
  );
}
