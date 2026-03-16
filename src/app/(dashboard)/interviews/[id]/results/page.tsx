"use client";

import { useParams, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { InterviewResults } from "@/components/interview/interview-results";

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const sessionId = searchParams.get("session") ?? undefined;

  const interview = trpc.interview.getById.useQuery({ id });

  if (interview.isLoading) {
    return <Skeleton className="h-[600px]" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {interview.data?.title} - Results
        </h1>
        <p className="text-muted-foreground">
          Review and analyze interview sessions
        </p>
      </div>

      <InterviewResults interviewId={id} initialSessionId={sessionId} />
    </div>
  );
}
