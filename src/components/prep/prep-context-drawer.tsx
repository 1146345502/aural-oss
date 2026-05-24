"use client";

import type { PrepContextInitial } from "@/components/prep/prep-context-types";
import { PrepJdResumePanel } from "@/components/prep/prep-jd-resume-panel";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc/client";
import { SlidersHorizontal } from "lucide-react";

type Props = {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackInitial: PrepContextInitial;
  onContextSaved?: () => void;
};

export function PrepContextDrawer({
  interviewId,
  open,
  onOpenChange,
  fallbackInitial,
  onContextSaved,
}: Props) {
  const utils = trpc.useUtils();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto code-scrollbar sm:max-w-2xl lg:max-w-4xl"
      >
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Practice context
          </SheetTitle>
          <SheetDescription>
            Job description and resume context are reused by hints, feedback,
            ratings, and suggested answers.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex-1">
          {open ? (
            <PrepJdResumePanel
              interviewId={interviewId}
              initial={fallbackInitial}
              onSaved={async () => {
                await Promise.all([
                  utils.prep.getBundle.invalidate({ interviewId }),
                  utils.interview.getById.invalidate({ id: interviewId }),
                ]);
                onContextSaved?.();
                onOpenChange(false);
              }}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
