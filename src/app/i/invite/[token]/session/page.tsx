"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AntiCheatingGuard } from "@/components/session/anti-cheating-banner";
import { IntervieweeOnboarding } from "@/components/session/interviewee-onboarding";
import { PreparingScreen } from "@/components/session/preparing-screen";
import {
  normalizeSessionEndReason,
  SessionEndedScreen,
  type SessionEndReason,
  type SessionEndReasonInput,
} from "@/components/session/session-ended-screen";
import { trpc } from "@/lib/trpc/client";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ChatInterface = dynamic(
  () => import("@/components/session/chat-interface").then((m) => m.ChatInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);
const VoiceInterface = dynamic(
  () => import("@/components/session/voice-interface").then((m) => m.VoiceInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);

export default function InviteSessionPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [completed, setCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<
    SessionEndReason | undefined
  >();
  const [onboardingDone, setOnboardingDone] = useState(false);

  const handleComplete = (reason?: SessionEndReasonInput) => {
    setCompletionReason(normalizeSessionEndReason(reason));
    setCompleted(true);
  };

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  useEffect(() => {
    if (candidate.isError) {
      router.replace(`/i/invite/${token}`);
    }
    if (candidate.data) {
      const session = (candidate.data as any).session;
      if (!session) {
        router.replace(`/i/invite/${token}`);
      }
    }
  }, [candidate.data, candidate.isError, token, router]);

  if (candidate.isLoading || !candidate.data) {
    return <PreparingScreen />;
  }

  const session = (candidate.data as any).session;
  const interview = (candidate.data as any).interview;

  if (!session) {
    return <PreparingScreen />;
  }

  if (completed || session.status === "COMPLETED") {
    return <SessionEndedScreen reason={completionReason} language={interview.language} />;
  }

  if (!onboardingDone) {
    return (
      <IntervieweeOnboarding
        interviewTitle={interview.title}
        interviewDescription={interview.description}
        questionCount={interview.questions?.length ?? 0}
        timeLimitMinutes={interview.timeLimitMinutes}
        language={interview.language}
        antiCheatingEnabled={!!interview.antiCheatingEnabled}
        voiceEnabled={!!interview.voiceEnabled}
        chatEnabled={!!interview.chatEnabled}
        aiName={interview.aiName}
        questionTypes={(interview.questions ?? []).map((q: any) => q.type as string)}
        onComplete={() => setOnboardingDone(true)}
      />
    );
  }

  const useVoice = interview.voiceEnabled;

  if (useVoice) {
    const interviewContext = {
      title: interview.title,
      objective: interview.objective,
      aiName: interview.aiName,
      aiTone: interview.aiTone,
      language: interview.language,
      followUpDepth: interview.followUpDepth,
      questions: interview.questions.map((q: any) => ({
        text: q.text,
        type: q.type,
        description: q.description,
        options: q.options,
        starterCode: q.starterCode as { language: string; code: string } | null,
        order: q.order,
      })),
    };

    return (
      <>
        <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} language={interview.language} />
        <VoiceInterface
          sessionId={session.id}
          interviewId={interview.id}
          interviewTitle={interview.title}
          aiName={interview.aiName}
          questionCount={interview.questions.length}
          interviewContext={interviewContext}
          durationMinutes={interview.timeLimitMinutes ?? undefined}
          chatEnabled={!!interview.chatEnabled}
          onComplete={handleComplete}
          videoMode={!!interview.videoEnabled}
        />
      </>
    );
  }

  return (
    <>
      <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} language={interview.language} />
      <ChatInterface
        sessionId={session.id}
        interview={{
          ...interview,
          questions: interview.questions.map((q: any) => ({
            ...q,
            starterCode: q.starterCode as { language: string; code: string } | null,
          })),
        }}
        durationMinutes={interview.timeLimitMinutes ?? undefined}
        onComplete={handleComplete}
      />
    </>
  );
}
