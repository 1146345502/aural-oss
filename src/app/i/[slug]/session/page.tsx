"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AntiCheatingGuard } from "@/components/session/anti-cheating-banner";
import { IntervieweeOnboarding, PreviewWrapper } from "@/components/session/interviewee-onboarding";
import { IntervieweeTourOverlay } from "@/components/session/interviewee-tour-overlay";
import { IntervieweeTourProvider } from "@/components/session/interviewee-tour-provider";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { Card, CardContent } from "@/components/ui/card";
import type { InterviewContext } from "@/hooks/use-voice";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "aural_session_";

const ChatInterface = dynamic(
  () => import("@/components/session/chat-interface").then((m) => m.ChatInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);
const VoiceInterface = dynamic(
  () => import("@/components/session/voice-interface").then((m) => m.VoiceInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);

export default function SlugSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const sidParam = searchParams.get("sid");
  const isPreview = searchParams.get("preview") === "true";

  const [completed, setCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<string | undefined>();
  const [onboardingDone, setOnboardingDone] = useState(isPreview);
  const [previewTourDone, setPreviewTourDone] = useState(false);

  const handleComplete = (reason?: string) => {
    setCompletionReason(reason);
    setCompleted(true);
  };

  const handleTourReady = useCallback(() => {
    setPreviewTourDone(true);
  }, []);

  const sessionId = useMemo(() => {
    if (sidParam) return sidParam;
    try { return localStorage.getItem(STORAGE_PREFIX + slug); } catch { return null; }
  }, [sidParam, slug]);

  const interview = trpc.interview.getBySlug.useQuery({ slug }, { retry: false });
  const session = trpc.session.getById.useQuery(
    { id: sessionId! },
    { enabled: !!sessionId, retry: false },
  );

  useEffect(() => {
    if (!sessionId || session.isError) {
      router.replace(`/i/${slug}`);
    }
  }, [sessionId, session.isError, slug, router]);


  if (interview.isLoading || session.isLoading || !interview.data || !session.data) {
    return <PreparingScreen />;
  }

  if (session.data.status === "COMPLETED" || completed) {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
            {completionReason === "TIME_LIMIT_EXCEEDED" && (
              <p className="mt-2 text-sm text-amber-600">
                The session time limit has been reached and the interview was ended automatically.
              </p>
            )}
            <p className="mt-2 text-muted-foreground">
              Your interview has been completed successfully. We appreciate your
              time and thoughtful responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const antiCheatingEnabled = !isPreview && !!interview.data.antiCheatingEnabled;

  if (!onboardingDone) {
    return (
      <IntervieweeOnboarding
        interviewTitle={interview.data.title}
        interviewDescription={interview.data.description}
        questionCount={interview.data.questions.length}
        timeLimitMinutes={interview.data.timeLimitMinutes}
        language={interview.data.language}
        antiCheatingEnabled={antiCheatingEnabled}
        voiceEnabled={!!interview.data.voiceEnabled}
        chatEnabled={!!interview.data.chatEnabled}
        aiName={interview.data.aiName}
        questionTypes={interview.data.questions.map((q: any) => q.type as string)}
        onComplete={() => setOnboardingDone(true)}
      />
    );
  }

  // Derive resume state
  const resumeMessages = session.data.messages;
  const resumeQuestionIndex = (() => {
    const { currentQuestionId } = session.data;
    if (currentQuestionId) {
      const idx = interview.data.questions.findIndex((q: any) => q.id === currentQuestionId);
      if (idx >= 0) return idx;
    }
    return 0;
  })();

  const isResuming = resumeMessages && resumeMessages.length > 0;

  const resumeTextMessages = resumeMessages
    ?.filter((m: any) => m.contentType === "TEXT")
    .map((m: any) => ({ id: m.id, role: m.role, content: m.content }));

  const resumeDrawings = resumeMessages
    ?.filter((m: any) => m.contentType === "WHITEBOARD" && m.whiteboardData)
    .map((m: any) => ({
      id: m.content,
      label: (m.whiteboardData as Record<string, unknown>)?.label as string ?? "Drawing",
      snapshotData: JSON.stringify(m.whiteboardData),
    }));

  const useVoice = interview.data.voiceEnabled;

  const showPreviewTour = isPreview && !previewTourDone && useVoice;

  if (showPreviewTour) {
    const mode = useVoice ? "voice" : "chat";
    const mockContext: InterviewContext = {
      title: interview.data.title,
      aiName: interview.data.aiName ?? "AI Interviewer",
      aiTone: "professional",
      language: interview.data.language ?? "en-US",
      followUpDepth: "medium",
      questions: interview.data.questions.map((q: any, i: number) => ({
        text: q.text,
        type: q.type as string,
        order: i,
      })),
    };

    return (
      <IntervieweeTourProvider mode={mode}>
        <PreviewWrapper onReady={handleTourReady}>
          {mode === "voice" ? (
            <VoiceInterface
              sessionId="__preview__"
              interviewId="__preview__"
              interviewTitle={interview.data.title}
              aiName={interview.data.aiName ?? "AI Interviewer"}
              questionCount={interview.data.questions.length}
              interviewContext={mockContext}
              durationMinutes={interview.data.timeLimitMinutes ?? undefined}
              chatEnabled={!!interview.data.chatEnabled}
              onComplete={() => {}}
              preview
            />
          ) : (
            <ChatInterface
              sessionId="__preview__"
              interview={{
                id: "__preview__",
                title: interview.data.title,
                aiName: interview.data.aiName ?? "AI Interviewer",
                mode: "CHAT",
                questions: mockContext.questions.map((q, i) => ({
                  id: `preview-q-${i}`,
                  text: q.text,
                  type: q.type,
                })),
              }}
              durationMinutes={interview.data.timeLimitMinutes ?? undefined}
              onComplete={() => {}}
              preview
            />
          )}
        </PreviewWrapper>
        <IntervieweeTourOverlay />
      </IntervieweeTourProvider>
    );
  }

  if (useVoice) {
    const interviewContext = {
      title: interview.data.title,
      objective: interview.data.objective,
      aiName: interview.data.aiName,
      aiTone: interview.data.aiTone,
      language: interview.data.language,
      followUpDepth: interview.data.followUpDepth,
      startQuestionIndex: isResuming ? resumeQuestionIndex : undefined,
      questions: interview.data.questions.map((q: any) => ({
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
        <AntiCheatingGuard enabled={antiCheatingEnabled} sessionId={sessionId!} />
        <VoiceInterface
          sessionId={sessionId!}
          interviewId={interview.data.id}
          interviewTitle={interview.data.title}
          aiName={interview.data.aiName}
          questionCount={interview.data.questions.length}
          interviewContext={interviewContext}
          durationMinutes={interview.data.timeLimitMinutes ?? undefined}
          initialMessages={isResuming ? resumeTextMessages : undefined}
          initialDrawings={isResuming && resumeDrawings?.length ? resumeDrawings : undefined}
          chatEnabled={!!interview.data.chatEnabled}
          onComplete={handleComplete}
          videoMode={isPreview ? false : !!interview.data.videoEnabled}
        />
      </>
    );
  }

  return (
    <>
      <AntiCheatingGuard enabled={antiCheatingEnabled} sessionId={sessionId!} />
      <ChatInterface
        sessionId={sessionId!}
        interview={{
          ...interview.data,
          questions: interview.data.questions.map((q: any) => ({
            ...q,
            starterCode: q.starterCode as { language: string; code: string } | null,
          })),
        }}
        durationMinutes={interview.data.timeLimitMinutes ?? undefined}
        initialMessages={resumeMessages
          ?.filter((m: any) => m.contentType !== "WHITEBOARD")
          .map((m: any) => ({
            id: m.id,
            role: m.role as "USER" | "ASSISTANT" | "SYSTEM",
            content: m.content,
            timestamp: m.timestamp.toString(),
          }))}
        initialQuestionIndex={isResuming ? resumeQuestionIndex : undefined}
        onComplete={handleComplete}
      />
    </>
  );
}
