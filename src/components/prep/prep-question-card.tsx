"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/ui/chat-composer";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PrepFeedbackStream } from "./prep-feedback-stream";
import { PrepFollowUp } from "./prep-follow-up";
import { PrepHintButton } from "./prep-hint-button";
import { readPrepStream } from "./prep-stream";
import {
    EMPTY_FEEDBACK,
    FOLLOW_UP_DEPTH_TURNS,
    type PrepAttempt,
    type PrepFeedback,
    type PrepFollowUpTurn,
    type PrepQuestion,
} from "./prep-types";

type FeedbackFinal = {
  attemptId?: string;
  feedback?: PrepFeedback;
  score?: number;
  attemptNumber?: number;
};

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatMinutes(seconds: number): string {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

type Props = {
  interviewId: string;
  language: string;
  followUpDepth: "LIGHT" | "MODERATE" | "DEEP";
  hasContext: boolean;
  sessionId: string | null;
  question: PrepQuestion;
  questionIndex: number;
  totalQuestions: number;
  mode: "TEXT" | "VOICE";
  remainingSeconds: number | null;
  attempts: PrepAttempt[];
  onAttemptCreated: () => void;
  onNext: () => void;
  onFinish: () => void;
};

export function PrepQuestionCard({
  interviewId,
  language,
  followUpDepth,
  hasContext,
  sessionId,
  question,
  questionIndex,
  totalQuestions,
  mode,
  remainingSeconds,
  attempts,
  onAttemptCreated,
  onNext,
  onFinish,
}: Props) {
  const { toast } = useToast();

  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setPhase] = useState<"idle" | "thinking" | "writing" | "finalizing">(
    "idle",
  );
  const [feedback, setFeedback] = useState<PrepFeedback | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const questionStartedAtRef = useRef(Date.now());

  const maxFollowUps = FOLLOW_UP_DEPTH_TURNS[followUpDepth] ?? 1;

  useEffect(() => {
    setAnswer("");
    setStreaming("");
    setFeedback(null);
    setAttemptId(null);
    setPhase("idle");
    questionStartedAtRef.current = Date.now();
  }, [question.id, sessionId]);

  const bestScoreForQuestion = useMemo(() => {
    const scores = attempts
      .filter((a) => a.questionId === question.id)
      .map((a) => Number(a.score))
      .filter((s) => Number.isFinite(s));
    return scores.length > 0 ? Math.max(...scores) : null;
  }, [attempts, question.id]);

  const activeAttempt = useMemo(() => {
    if (attemptId) {
      return attempts.find((a) => a.id === attemptId) ?? null;
    }
    return null;
  }, [attemptId, attempts]);

  const followUpTurns: PrepFollowUpTurn[] = activeAttempt
    ? safeArray<PrepFollowUpTurn>(activeAttempt.followUp)
    : [];

  const progress =
    totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;

  const submit = async () => {
    if (!sessionId || answer.trim().length < 8 || submitting) return;
    setSubmitting(true);
    setStreaming("");
    setFeedback(null);
    setPhase("thinking");
    try {
      const res = await fetch("/api/prep/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: question.id,
          answerText: answer.trim(),
          inputMode: mode,
          durationSeconds: Math.round(
            (Date.now() - questionStartedAtRef.current) / 1000,
          ),
        }),
      });

      const final = await readPrepStream<FeedbackFinal>(res, (token) => {
        setPhase("writing");
        setStreaming((prev) => prev + token);
      });

      setPhase("finalizing");
      if (!final) {
        throw new Error("Feedback stream ended without a final payload");
      }
      const finalFeedback: PrepFeedback = {
        ...EMPTY_FEEDBACK,
        ...(final.feedback ?? {}),
      };
      setFeedback(finalFeedback);
      setAttemptId(final.attemptId ?? null);
      onAttemptCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Feedback failed";
      toast({
        title: "Feedback failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      setStreaming("");
      setPhase("idle");
    }
  };

  const retry = () => {
    setAnswer("");
    setStreaming("");
    setFeedback(null);
    setAttemptId(null);
    questionStartedAtRef.current = Date.now();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary" className="uppercase tracking-wide">
            {question.type || "OPEN_ENDED"}
          </Badge>
          {remainingSeconds !== null ? (
            <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
              <Timer className="h-4 w-4" />
              {formatMinutes(remainingSeconds)}
            </div>
          ) : null}
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground">
          Question {questionIndex + 1} of {totalQuestions}
          {bestScoreForQuestion !== null
            ? ` · best score so far ${bestScoreForQuestion.toFixed(1)}`
            : null}
        </p>
        <div className="rounded-md border bg-muted/30 p-5">
          <p className="text-lg font-medium leading-relaxed">{question.text}</p>
          {question.description ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {question.description}
            </p>
          ) : null}
        </div>
      </div>

      <PrepHintButton
        interviewId={interviewId}
        questionId={question.id}
        disabledReason={
          !hasContext ? "Add JD or resume to enable hints" : undefined
        }
      />

      <div className="space-y-2">
        <Label htmlFor="prep-answer">Your answer</Label>
        <ChatComposer
          value={answer}
          onChange={setAnswer}
          onSubmit={submit}
          onStop={() => setSubmitting(false)}
          isGenerating={submitting}
          submitDisabled={answer.trim().length < 8}
          minLength={8}
          placeholder={
            mode === "VOICE"
              ? "Your transcript will appear here..."
              : "Type your answer..."
          }
          voice={mode === "VOICE" ? { language, disabled: submitting } : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="gap-2" onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear and answer again</TooltipContent>
        </Tooltip>
        <Button variant="outline" onClick={onFinish}>
          Finish session
        </Button>
        {feedback && questionIndex < totalQuestions - 1 ? (
          <Button className="ml-auto gap-2" onClick={onNext}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <PrepFeedbackStream
        feedback={feedback}
        streaming={streaming}
        isLoading={submitting}
        language={language}
      />

      <PrepFollowUp
        attemptId={attemptId}
        initialFollowUpQuestion={feedback?.followUpQuestion ?? ""}
        existingTurns={followUpTurns}
        maxTurns={maxFollowUps}
        onTurnSaved={onAttemptCreated}
      />
    </div>
  );
}
