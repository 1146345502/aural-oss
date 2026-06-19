"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, PanelLeftClose, RotateCcw } from "lucide-react";
import { scoreTone } from "./prep-types";

/** Per-question progress inside the current practice session. */
export type PracticeQuestionStatus = {
  questionId: string;
  index: number;
  text: string;
  type: string;
  attemptCount: number;
  bestScore: number | null;
  /** Answered but best score is below the retry bar. */
  needsRetry: boolean;
};

export const PRACTICE_RETRY_SCORE_BAR = 6;

function StatusIcon({
  status,
  isCurrent,
}: {
  status: PracticeQuestionStatus;
  isCurrent: boolean;
}) {
  if (status.needsRetry) {
    return (
      <RotateCcw
        className="h-3.5 w-3.5 shrink-0 text-orange-500"
        aria-label="Needs retry"
      />
    );
  }
  if (status.attemptCount > 0) {
    return (
      <CheckCircle2
        className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-label="Answered"
      />
    );
  }
  return (
    <Circle
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        isCurrent ? "text-primary" : "text-muted-foreground/40",
      )}
      aria-label="Unanswered"
    />
  );
}

function statusCaption(status: PracticeQuestionStatus): string {
  if (status.attemptCount === 0) return "Unanswered";
  const best =
    status.bestScore != null ? `Best ${status.bestScore.toFixed(1)}` : "Answered";
  if (status.needsRetry) return `${best} · retry`;
  return `${best} · ${status.attemptCount} attempt${status.attemptCount === 1 ? "" : "s"}`;
}

/**
 * Question list with per-question status (unanswered / answered / best score /
 * needs retry). Rendered as the desktop left rail and inside the mobile sheet.
 */
export function PracticeQuestionNavigator({
  statuses,
  currentIndex,
  disabled = false,
  onNavigate,
  onToggleSidebar,
  className,
}: {
  statuses: PracticeQuestionStatus[];
  currentIndex: number;
  disabled?: boolean;
  onNavigate: (index: number) => void;
  /** Desktop: collapse the questions rail. */
  onToggleSidebar?: () => void;
  className?: string;
}) {
  const answered = statuses.filter((status) => status.attemptCount > 0).length;
  const needRetry = statuses.filter((status) => status.needsRetry).length;

  return (
    <TooltipProvider delayDuration={200}>
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">Questions</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {answered}/{statuses.length} answered
            {needRetry > 0 ? ` · ${needRetry} to retry` : ""}
          </p>
        </div>
        {onToggleSidebar ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={onToggleSidebar}
                aria-label="Hide questions panel"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Hide questions panel
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="space-y-1 p-2">
          {statuses.map((status) => {
            const isCurrent = status.index === currentIndex;
            return (
              <li key={status.questionId}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onNavigate(status.index)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors",
                    "hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60",
                    isCurrent && "border-primary/30 bg-primary/10 hover:bg-primary/10",
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <StatusIcon status={status} isCurrent={isCurrent} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-[11px] font-semibold uppercase tracking-wide",
                            isCurrent ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          Q{status.index + 1}
                        </span>
                        {status.bestScore != null ? (
                          <span
                            className={cn(
                              "text-xs font-bold tabular-nums",
                              scoreTone(status.bestScore),
                            )}
                          >
                            {status.bestScore.toFixed(1)}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs leading-snug text-foreground/90">
                        {status.text}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {statusCaption(status)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </ScrollArea>
    </div>
    </TooltipProvider>
  );
}
