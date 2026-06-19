/** One bucket of the recorded answer on the delivery timeline. */
export type PrepVoiceTimelineSegment = {
  /** Segment start, seconds from the beginning of the recording. */
  startSec: number;
  /** Segment end, seconds from the beginning of the recording. */
  endSec: number;
  /** Normalized loudness 0-1 relative to the recording's speech peak. */
  energy: number;
  /** Approximate pace inside the segment (speakable units per minute). */
  wpm: number | null;
  /** Segment is mostly silence. */
  pause: boolean;
  /** Estimated filler-word count inside the segment. */
  fillers: number;
  /** Audible energy dip while speaking (possible confidence dip). */
  lowConfidence: boolean;
};

export type PrepVoiceDeliveryFeedback = {
  confidence: number;
  clarity: number;
  tone: number;
  tips: string[];
  timeline?: PrepVoiceTimelineSegment[];
  pauseCount?: number;
  longestPauseSec?: number;
  fillerCount?: number;
};

export type PrepFeedback = {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  missingSignals: string[];
  resumeLeverage: string[];
  structureSuggestion: string;
  followUpQuestion: string;
  sampleAnswer: string;
  needsUserVerification: string[];
  voiceDelivery?: PrepVoiceDeliveryFeedback;
};

export type PrepFollowUpTurn = {
  prompt: string;
  answer: string;
  refinement: {
    verdict: string;
    stillStrong: string[];
    stillMissing: string[];
  };
  shouldContinue: boolean;
  nextPrompt: string;
};

export type PrepQuestion = {
  id: string;
  interviewId: string;
  order: number;
  text: string;
  description: string | null;
  type: string;
  options?: unknown;
};

export type PrepQuestionOption = {
  label: string;
  value?: string;
};

function normalizeOptionItem(item: unknown): PrepQuestionOption | null {
  if (typeof item === "string") {
    const label = item.trim();
    return label ? { label } : null;
  }
  if (!item || typeof item !== "object") return null;

  const record = item as Record<string, unknown>;
  const label =
    typeof record.label === "string"
      ? record.label.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : typeof record.value === "string"
          ? record.value.trim()
          : "";
  if (!label) return null;

  return {
    label,
    value: typeof record.value === "string" ? record.value : undefined,
  };
}

export function normalizePrepQuestionOptions(value: unknown): PrepQuestionOption[] {
  const rawOptions =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { options?: unknown }).options
      : value;

  if (!Array.isArray(rawOptions)) return [];

  return rawOptions
    .map(normalizeOptionItem)
    .filter((option): option is PrepQuestionOption => option !== null);
}

export type PrepAttempt = {
  id: string;
  sessionId: string;
  interviewId: string;
  questionId: string;
  userId: string;
  answerText: string;
  inputMode: string;
  durationSeconds: number | null;
  feedback: PrepFeedback;
  followUp: PrepFollowUpTurn[];
  score: number | null;
  attemptNumber: number;
  createdAt: string;
  audioUrl?: string | null;
  audioDurationSeconds?: number | null;
};

export const EMPTY_FEEDBACK: PrepFeedback = {
  score: 0,
  verdict: "",
  summary: "",
  strengths: [],
  improvements: [],
  missingSignals: [],
  resumeLeverage: [],
  structureSuggestion: "",
  followUpQuestion: "",
  sampleAnswer: "",
  needsUserVerification: [],
  voiceDelivery: undefined,
};

export function scoreTone(score?: number | null): string {
  if (!score) return "text-muted-foreground";
  if (score >= 8) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 6) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/** Pill badge background, border, and text for score chips. */
export function scoreBadgeClasses(score?: number | null): string {
  if (!score) {
    return "border-border/80 bg-muted/60 text-muted-foreground";
  }
  if (score >= 8) {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-700 shadow-emerald-100/50 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:shadow-none";
  }
  if (score >= 6) {
    return "border-amber-200/80 bg-amber-50 text-amber-700 shadow-amber-100/50 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-400 dark:shadow-none";
  }
  return "border-red-200/80 bg-red-50 text-red-700 shadow-red-100/50 dark:border-red-800/80 dark:bg-red-950/40 dark:text-red-400 dark:shadow-none";
}

export function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export function normalizeAttempt(raw: unknown): PrepAttempt {
  const a = raw as Partial<PrepAttempt> & { feedback?: unknown; followUp?: unknown };
  const feedback = (a.feedback ?? {}) as Partial<PrepFeedback>;
  return {
    id: a.id ?? "",
    sessionId: a.sessionId ?? "",
    interviewId: a.interviewId ?? "",
    questionId: a.questionId ?? "",
    userId: a.userId ?? "",
    answerText: a.answerText ?? "",
    inputMode: a.inputMode ?? "TEXT",
    durationSeconds: a.durationSeconds ?? null,
    feedback: {
      ...EMPTY_FEEDBACK,
      ...feedback,
      strengths: safeStringArray(feedback.strengths),
      improvements: safeStringArray(feedback.improvements),
      missingSignals: safeStringArray(feedback.missingSignals),
      resumeLeverage: safeStringArray(feedback.resumeLeverage),
      needsUserVerification: safeStringArray(feedback.needsUserVerification),
    },
    followUp: Array.isArray(a.followUp)
      ? (a.followUp as PrepFollowUpTurn[])
      : [],
    score: typeof a.score === "number" ? a.score : null,
    attemptNumber: a.attemptNumber ?? 1,
    createdAt: a.createdAt ?? "",
    audioUrl: typeof a.audioUrl === "string" ? a.audioUrl : null,
    audioDurationSeconds:
      typeof a.audioDurationSeconds === "number"
        ? a.audioDurationSeconds
        : null,
  };
}

export const FOLLOW_UP_DEPTH_TURNS: Record<string, number> = {
  LIGHT: 0,
  MODERATE: 1,
  DEEP: 3,
};
