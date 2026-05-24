import {
    EMPTY_FEEDBACK,
    type PrepAttempt,
    type PrepFeedback,
    type PrepQuestion,
} from "@/components/prep/prep-types";

type PracticeMode = "TEXT" | "VOICE";

export type PracticeResumeChatMessage =
  | {
      id: string;
      role: "assistant";
      kind: "question";
      content: string;
      questionIndex: number;
      questionType?: string;
    }
  | {
      id: string;
      role: "user";
      kind: "answer";
      content: string;
      mode: PracticeMode;
      audioUrl?: string;
      audioDurationMs?: number;
      audioCreatedAt?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "feedback";
      feedback: PrepFeedback;
      feedbackPartial: false;
      phase: "idle";
    };

export type PracticeResumeState = {
  messages: PracticeResumeChatMessage[];
  questionIndex: number;
  awaitingRetry: boolean;
  activePrompt: {
    kind: "question";
    questionId: string;
    questionIndex: number;
    prompt: string;
  };
  pinnedQuestionIndex: number | null;
  pinnedMessageId: string | null;
};

function normalizeFeedback(feedback?: PrepFeedback): PrepFeedback {
  return {
    ...EMPTY_FEEDBACK,
    ...(feedback ?? {}),
    strengths: Array.isArray(feedback?.strengths)
      ? feedback.strengths.filter((item): item is string => typeof item === "string")
      : [],
    improvements: Array.isArray(feedback?.improvements)
      ? feedback.improvements.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    missingSignals: Array.isArray(feedback?.missingSignals)
      ? feedback.missingSignals.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    resumeLeverage: Array.isArray(feedback?.resumeLeverage)
      ? feedback.resumeLeverage.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    needsUserVerification: Array.isArray(feedback?.needsUserVerification)
      ? feedback.needsUserVerification.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    voiceDelivery: feedback?.voiceDelivery,
  };
}

function questionMessage(
  question: PrepQuestion,
  index: number,
): PracticeResumeChatMessage {
  return {
    id: `question-${question.id}`,
    role: "assistant",
    kind: "question",
    content: question.text,
    questionIndex: index,
    questionType: question.type || "OPEN_ENDED",
  };
}

function toPracticeMode(inputMode: string): PracticeMode {
  return inputMode === "VOICE" ? "VOICE" : "TEXT";
}

/** Rebuild chat state from persisted attempts for an in-progress session. */
export function buildPracticeResumeState(
  questions: PrepQuestion[],
  sessionAttempts: PrepAttempt[],
): PracticeResumeState | null {
  if (questions.length === 0 || sessionAttempts.length === 0) {
    return null;
  }

  const questionIndexById = new Map(questions.map((question, index) => [question.id, index]));
  const sortedAttempts = [...sessionAttempts].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  const messages: PracticeResumeChatMessage[] = [];
  const questionsInThread = new Set<number>();

  for (const attempt of sortedAttempts) {
    const questionIndex = questionIndexById.get(attempt.questionId);
    if (questionIndex === undefined) continue;

    if (!questionsInThread.has(questionIndex)) {
      messages.push(questionMessage(questions[questionIndex], questionIndex));
      questionsInThread.add(questionIndex);
    }

    messages.push({
      id: `answer-${attempt.id}`,
      role: "user",
      kind: "answer",
      content: attempt.answerText,
      mode: toPracticeMode(attempt.inputMode),
      audioUrl: attempt.audioUrl ?? undefined,
      audioDurationMs:
        attempt.audioDurationSeconds != null
          ? Math.floor(attempt.audioDurationSeconds * 1000)
          : undefined,
      audioCreatedAt: attempt.createdAt,
    });

    messages.push({
      id: `feedback-${attempt.id}`,
      role: "assistant",
      kind: "feedback",
      feedback: normalizeFeedback(attempt.feedback),
      feedbackPartial: false,
      phase: "idle",
    });
  }

  const lastAttempt = sortedAttempts[sortedAttempts.length - 1];
  const lastQuestionIndex = questionIndexById.get(lastAttempt.questionId);
  if (lastQuestionIndex === undefined) {
    return null;
  }

  const lastQuestion = questions[lastQuestionIndex];
  const lastFeedbackId = `feedback-${lastAttempt.id}`;

  return {
    messages,
    questionIndex: lastQuestionIndex,
    awaitingRetry: true,
    activePrompt: {
      kind: "question",
      questionId: lastQuestion.id,
      questionIndex: lastQuestionIndex,
      prompt: lastQuestion.text,
    },
    pinnedQuestionIndex: null,
    pinnedMessageId: lastFeedbackId,
  };
}
