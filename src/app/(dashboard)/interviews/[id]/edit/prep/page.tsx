"use client";

import {
    PracticeSessionsDashboard,
    type PracticeSessionSummary,
} from "@/components/prep/practice-sessions-dashboard";
import { PrepContextDrawer } from "@/components/prep/prep-context-drawer";
import { prepContextFromInterview } from "@/components/prep/prep-context-types";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { Play, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useEditInterview } from "../edit-context";

type EditCtxInterview = {
  id: string;
  title?: string;
  description?: string | null;
  language?: string | null;
  jobDescription?: string | null;
  resumeText?: string | null;
  companyName?: string | null;
  roleTitle?: string | null;
};

export default function PracticesTab() {
  const { interviewId, interview } = useEditInterview();
  const ctxInterview = interview as unknown as EditCtxInterview;
  const practices = trpc.prep.listSessions.useQuery({ interviewId });
  const [contextOpen, setContextOpen] = useState(false);

  const fallbackInitial = useMemo(
    () => prepContextFromInterview(ctxInterview),
    [ctxInterview],
  );

  return (
    <div className="space-y-6">
      <PracticeSessionsDashboard
        rows={(practices.data?.sessions ?? []) as PracticeSessionSummary[]}
        isLoading={practices.isLoading}
        showHeader={false}
        showInterviewColumn={false}
        toolbarAction={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 border-primary text-primary hover:bg-primary/5 hover:text-primary"
              onClick={() => setContextOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Context
            </Button>
            <Button asChild className="gap-2">
              <Link
                href={`/practice/${interviewId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Play className="h-4 w-4" />
                Practice interview
              </Link>
            </Button>
          </div>
        }
      />

      <PrepContextDrawer
        interviewId={interviewId}
        open={contextOpen}
        onOpenChange={setContextOpen}
        fallbackInitial={fallbackInitial}
      />
    </div>
  );
}
