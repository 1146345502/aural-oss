"use client";

import { PreparingScreen } from "@/components/session/preparing-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2, Link2Off, Loader2, Lock, MessageSquare, Mic, Plus, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "aural_session_";

export default function PublicInterviewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { toast } = useToast();

  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [completed] = useState(false);

  // ── Existing session detection ─────────────────────────────────
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + slug);
      if (stored) setStoredSessionId(stored);
    } catch {
      // localStorage may be unavailable
    }
  }, [slug]);

  const existingSession = trpc.session.getById.useQuery(
    { id: storedSessionId! },
    { enabled: !!storedSessionId, retry: false },
  );

  useEffect(() => {
    if (!storedSessionId) return;
    if (existingSession.isError || (existingSession.data && existingSession.data.status !== "IN_PROGRESS")) {
      try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
      setStoredSessionId(null);
    }
  }, [existingSession.data, existingSession.isError, storedSessionId, slug]);

  const canResume = !!storedSessionId && existingSession.data?.status === "IN_PROGRESS";

  const interview = trpc.interview.getBySlug.useQuery({ slug }, { retry: false });

  const createSession = trpc.session.create.useMutation({
    onSuccess: (data) => {
      try { localStorage.setItem(STORAGE_PREFIX + slug, data.sessionId); } catch { /* noop */ }
      goToSession(data.sessionId);
    },
    onError: (err) => {
      toast({
        title: "Failed to start interview",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    router.prefetch(`/i/${slug}/session`);
  }, [router, slug]);

  const goToSession = useCallback((sid: string) => {
    router.push(`/i/${slug}/session?sid=${sid}`);
  }, [router, slug]);

  // ── Resume / Start-new handlers ────────────────────────────────
  const handleResume = useCallback(() => {
    if (!existingSession.data || !storedSessionId) return;
    goToSession(storedSessionId);
  }, [existingSession.data, storedSessionId, goToSession]);

  const handleStartNew = useCallback(() => {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    setStoredSessionId(null);
  }, [slug]);

  if (interview.isLoading) {
    return <PreparingScreen />;
  }

  if (interview.isError || !interview.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Interview Not Available</h2>
            <p className="text-muted-foreground mt-2">
              This interview may have been removed or is no longer accepting
              responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
            <p className="mt-2 text-muted-foreground">
              Your interview has been completed successfully. We appreciate your
              time and thoughtful responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (storedSessionId && existingSession.isLoading) {
    return <PreparingScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <CardTitle className="font-heading text-2xl">{interview.data.title}</CardTitle>
          {interview.data.description && (
            <CardDescription>{interview.data.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {/* ── Invite-only notice ───────────────────────── */}
          {interview.data.requireInvite && !canResume && (
            <div className="py-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-medium">Invite only</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This interview is accessible only through a personal invite link.
                Please check your email for the link from the interviewer.
              </p>
            </div>
          )}

          {/* ── Resume banner ──────────────────────────────── */}
          {canResume && (
            <div className="mb-6 space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">
                  You have an unfinished interview session.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick up right where you left off, or start fresh.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1" onClick={handleResume}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Continue Interview
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleStartNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Start New
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Start form ────────────────────────────────── */}
          {!interview.data.requireInvite && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createSession.mutate({
                  interviewSlug: slug,
                  participantName,
                  participantEmail,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">
                  Your Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Your Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={participantEmail}
                  onChange={(e) => setParticipantEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p>
                  {interview.data.questions.length} questions &middot;{" "}
                  {interview.data.timeLimitMinutes
                    ? `${interview.data.timeLimitMinutes} min`
                    : "No time limit"}
                  
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2 text-sm">
                {interview.data.voiceEnabled ? (
                  <>
                    <Mic className="h-4 w-4 text-primary" />
                    <span>
                      {interview.data.chatEnabled
                        ? "This interview supports voice and text chat"
                        : "This interview uses voice mode (requires Chrome or Edge)"}
                    </span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span>This interview uses text chat</span>
                  </>
                )}
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={
                  !participantName.trim() ||
                  !participantEmail.trim() ||
                  createSession.isLoading
                }
              >
                {createSession.isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Begin Interview
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
