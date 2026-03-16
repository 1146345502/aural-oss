"use client";

import { InterviewResults } from "@/components/interview/interview-results";
import { CandidateManager } from "@/components/interview/candidate-manager";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useEditInterview } from "../edit-context";

export default function SessionsTab() {
  const { interview, interviewId } = useEditInterview();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session") || undefined;

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );

  if (selectedSessionId) {
    return (
      <InterviewResults
        interviewId={interviewId}
        initialSessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  return (
    <CandidateManager
      interviewId={interviewId}
      interview={interview}
      onViewSession={(sessionId) => setSelectedSessionId(sessionId)}
    />
  );
}
