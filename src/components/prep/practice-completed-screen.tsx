"use client";

import { AuralLogo } from "@/components/ui/aural-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

export function PracticeCompletedScreen({
  interviewId,
  interviewTitle,
}: {
  interviewId: string;
  interviewTitle: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-card px-6">
        <div className="flex items-center gap-1">
          <AuralLogo size={28} className="shrink-0" />
          <span className="font-heading text-base font-bold tracking-[2px]">AURAL</span>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Practice complete</h2>
            <p className="mt-2 text-sm text-muted-foreground">{interviewTitle}</p>
            <p className="mt-4 text-muted-foreground">
              Your session has been saved. Review your scores and try another run
              when you are ready.
            </p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild variant="outline">
                <Link href={`/interviews/${interviewId}/edit/prep`}>Back to prep</Link>
              </Button>
              <Button asChild>
                <Link href="/practices">All practices</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
