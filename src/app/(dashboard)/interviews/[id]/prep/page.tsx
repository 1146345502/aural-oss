"use client";

import { PracticeCompletedScreen } from "@/components/prep/practice-completed-screen";
import { PracticeSessionChat } from "@/components/prep/practice-session-chat";
import {
    type PrepAttempt,
    type PrepQuestion,
    normalizeAttempt,
} from "@/components/prep/prep-types";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePrepSessionLeave } from "@/hooks/use-prep-session-leave";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_MODE = "VOICE" as const;

export default function FocusedPrepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  const resumeSessionId = searchParams.get("session");
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const bundleQuery = trpc.prep.getBundle.useQuery({ interviewId });

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [practiceCompleted, setPracticeCompleted] = useState(false);
  const [activeQuestions, setActiveQuestions] = useState<PrepQuestion[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerCompletedRef = useRef(false);
  const startAttemptedRef = useRef(false);

  const interview = bundleQuery.data?.interview;
  const questions = useMemo(
    () => (bundleQuery.data?.questions ?? []) as PrepQuestion[],
    [bundleQuery.data?.questions],
  );
  const attempts = useMemo<PrepAttempt[]>(
    () => (bundleQuery.data?.attempts ?? []).map(normalizeAttempt),
    [bundleQuery.data?.attempts],
  );
  const planTier = bundleQuery.data?.planTier ?? "Self-hosted";
  const mediaRetentionDays = bundleQuery.data?.mediaRetention?.retentionDays ?? 7;

  const startSession = trpc.prep.startSession.useMutation({
    onSuccess: (session) => {
      setSessionId(session.id);
      timerCompletedRef.current = false;
      setRemainingSeconds(null);
      toast({ title: "Practice started" });
    },
    onError: (err) => {
      startAttemptedRef.current = false;
      setActiveQuestions([]);
      const message = err.message;
      toast({
        title: "Could not start practice",
        description: message,
        variant: "destructive",
      });
    },
  });

  const endSession = trpc.prep.endSession.useMutation({
    onSuccess: () => {
      setSessionId(null);
      setRemainingSeconds(null);
      setActiveQuestions([]);
      setPracticeCompleted(true);
      startAttemptedRef.current = false;
      utils.prep.getBundle.invalidate({ interviewId });
      utils.prep.listSessions.invalidate({ interviewId });
    },
    onError: (err) => {
      toast({
        title: "Could not end session",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { mutate: startSessionMutate, isPending: isStartingSession } =
    startSession;

  useEffect(() => {
    if (bundleQuery.isLoading || bundleQuery.isError) return;
    if (!interview || questions.length === 0) return;
    if (sessionId || practiceCompleted || isStartingSession) return;
    if (startAttemptedRef.current) return;

    startAttemptedRef.current = true;
    setActiveQuestions(questions);

    if (resumeSessionId) {
      const resumeSession = bundleQuery.data?.sessions?.find(
        (session) => session.id === resumeSessionId,
      );
      if (resumeSession?.status === "IN_PROGRESS") {
        setSessionId(resumeSession.id);
        return;
      }
    }

    startSessionMutate({
      interviewId,
      mode: DEFAULT_MODE,
      timed: false,
    });
  }, [
    bundleQuery.data?.sessions,
    bundleQuery.isError,
    bundleQuery.isLoading,
    interview,
    interviewId,
    isStartingSession,
    practiceCompleted,
    questions,
    resumeSessionId,
    sessionId,
    startSessionMutate,
  ]);

  const hasContext =
    !!interview?.jobDescription?.trim() || !!interview?.resumeText?.trim();

  usePrepSessionLeave(sessionId, !practiceCompleted && !endSession.isPending);

  if (bundleQuery.isLoading) {
    return (
      <PreparingScreen
        title="Loading practice..."
        description="Setting up your coaching session."
      />
    );
  }

  if (practiceCompleted && interview) {
    return (
      <PracticeCompletedScreen
        interviewId={interviewId}
        interviewTitle={interview.title}
      />
    );
  }

  if (!interview) {
    return (
      <Card>
        <CardContent className="flex h-[400px] flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">Interview not found.</p>
          <Button asChild>
            <Link href="/interviews">Back to interviews</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[400px] flex-col items-center justify-center gap-3">
          <BrainCircuit className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This interview has no questions yet.
          </p>
          <Button asChild>
            <Link href={`/interviews/${interviewId}/edit`}>Add questions</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (startSession.isError) {
    return (
      <Card>
        <CardContent className="flex h-[400px] flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {startSession.error.message}
          </p>
          <Button
            onClick={() => {
              startAttemptedRef.current = false;
              startSession.reset();
              setActiveQuestions(questions);
              startSessionMutate({
                interviewId,
                mode: DEFAULT_MODE,
                timed: false,
              });
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isStartingSession || !sessionId) {
    return (
      <PreparingScreen
        title="Starting practice..."
        description="Setting up your coaching session."
      />
    );
  }

  return (
    <TooltipProvider>
      <PracticeSessionChat
        interviewId={interviewId}
        sessionId={sessionId}
        interviewTitle={interview.title}
        language={interview.language}
        hasContext={hasContext}
        prepContext={{
          jobDescription: interview.jobDescription ?? null,
          resumeText: interview.resumeText ?? null,
          companyName: interview.companyName ?? null,
          roleTitle: interview.roleTitle ?? null,
        }}
        onPrepContextSaved={() =>
          utils.prep.getBundle.invalidate({ interviewId })
        }
        questions={activeQuestions}
        mode={DEFAULT_MODE}
        remainingSeconds={remainingSeconds}
        attempts={attempts}
        planTier={planTier}
        mediaRetentionDays={mediaRetentionDays}
        onAttemptCreated={() =>
          utils.prep.getBundle.invalidate({ interviewId })
        }
        onFinish={() => endSession.mutate({ sessionId })}
        isFinishing={endSession.isPending}
      />
    </TooltipProvider>
  );
}
