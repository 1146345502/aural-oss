"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { QuestionBuilder } from "@/components/interview/question-builder";
import { useEditInterview } from "./edit-context";

export default function ContentTab() {
  const { interview, interviewId } = useEditInterview();

  return (
    <QuestionBuilder
      interviewId={interviewId}
      questions={(interview as any).questions.map((q: any) => ({
        ...q,
        starterCode: q.starterCode as { language: string; code: string } | null,
      }))}
      assessmentCriteria={
        (interview as any).assessmentCriteria as
          | { name: string; description: string }[]
          | null
      }
    />
  );
}
