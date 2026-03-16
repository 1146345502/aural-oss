"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Link2Off, CheckCircle2 } from "lucide-react";
import { PreparingScreen } from "@/components/session/preparing-screen";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [completed, setCompleted] = useState(false);
  const sessionCreationAttempted = useRef(false);

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    { retry: false },
  );

  const createSession = trpc.session.createFromInvite.useMutation({
    onSuccess: () => {
      goToSession();
    },
  });

  const sessionPath = `/i/invite/${token}/session`;

  useEffect(() => {
    router.prefetch(sessionPath);
  }, [router, sessionPath]);

  const goToSession = useCallback(() => {
    router.push(sessionPath);
  }, [router, sessionPath]);

  useEffect(() => {
    if (!candidate.data || completed) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (candidate.data as any).session;
    if (session) {
      if (session.status === "COMPLETED") {
        setCompleted(true);
      } else {
        goToSession();
      }
      return;
    }

    if (!sessionCreationAttempted.current) {
      sessionCreationAttempted.current = true;
      createSession.mutate({ inviteToken: token });
    }
  }, [candidate.data, completed, createSession, token, goToSession]);

  // Loading
  if (candidate.isLoading) {
    return <PreparingScreen />;
  }

  // Error / invalid token
  if (candidate.isError || !candidate.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Invalid Invite Link</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is invalid or the interview is no longer available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Completed
  if (completed) {
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

  // Creating session
  return <PreparingScreen />;
}
