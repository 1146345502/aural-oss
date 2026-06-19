"use client";

import { PracticeSessionReport } from "@/components/prep/practice-session-report";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function PracticeReportPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const reportQuery = trpc.prep.getSessionReport.useQuery(
    { sessionId },
    { enabled: !!sessionId },
  );
  const interviewTitle = reportQuery.data?.interview.title;

  return (
    <div className="space-y-6" data-testid="practice-report-page">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
          <Link href="/practices">
            <ArrowLeft className="h-4 w-4" />
            All practices
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-bold">Practice report</h1>
        <p className="text-muted-foreground">
          {interviewTitle ?? "Review scores, feedback, and recordings from this run."}
        </p>
      </div>
      <PracticeSessionReport sessionId={sessionId} />
    </div>
  );
}
