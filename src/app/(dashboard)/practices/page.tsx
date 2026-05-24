"use client";

import { useProject } from "@/components/project-provider";
import {
  PracticeSessionsDashboard,
  type PracticeSessionSummary,
} from "@/components/prep/practice-sessions-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";

export default function PracticesPage() {
  const { currentProject, isLoading: projectLoading } = useProject();
  const projectId = currentProject?.id;
  const practices = trpc.prep.listSessions.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  if (projectLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  return (
    <PracticeSessionsDashboard
      title="Practices"
      subtitle={
        currentProject
          ? `Review coaching practice runs across interviews in ${currentProject.name}.`
          : "Review coaching practice runs across your accessible interviews."
      }
      rows={(practices.data?.sessions ?? []) as PracticeSessionSummary[]}
      isLoading={practices.isLoading}
      showMetrics={false}
    />
  );
}
