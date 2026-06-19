"use client";

import { PracticeSessionReport } from "@/components/prep/practice-session-report";
import { AuralLogo } from "@/components/ui/aural-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, RotateCcw } from "lucide-react";
import Link from "next/link";

export function PracticeCompletedScreen({
  interviewId,
  interviewTitle,
  sessionId,
  onPracticeAgain,
}: {
  interviewId: string;
  interviewTitle: string;
  /** Just-finished session; renders the full report when available. */
  sessionId?: string | null;
  onPracticeAgain?: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-1">
          <AuralLogo size={28} className="shrink-0" />
          <span className="font-heading text-base font-bold tracking-[2px]">AURAL</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/interviews/${interviewId}/edit/prep`}>Back to prep</Link>
          </Button>
          {onPracticeAgain ? (
            <Button size="sm" onClick={onPracticeAgain}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Practice again
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href={`/practice/${interviewId}`}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Practice again
              </Link>
            </Button>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:gap-4 sm:text-left">
            <CheckCircle2 className="h-12 w-12 shrink-0 text-secondary-500" />
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">Practice complete</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {interviewTitle} — your session is saved. Review the report
                below, then plan your next run.
              </p>
            </div>
            <Button asChild variant="ghost" className="sm:ml-auto">
              <Link href="/practices">All practices</Link>
            </Button>
          </CardContent>
        </Card>

        {sessionId ? (
          <PracticeSessionReport
            sessionId={sessionId}
            onPracticeAgain={onPracticeAgain}
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Find this run anytime under{" "}
            <Link href="/practices" className="font-medium underline underline-offset-2">
              Practices
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
