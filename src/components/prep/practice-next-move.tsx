"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    ArrowRight,
    BookOpenText,
    ExternalLink,
    FilePlus2,
    Flag,
    RotateCcw,
    Save,
    Sparkles,
    X,
} from "lucide-react";
import type { PrepFeedback } from "./prep-types";

export type PracticeNextAction =
  | "retry"
  | "sample"
  | "next"
  | "draft"
  | "real_interview"
  | "resume_proof"
  | "finish";

export type NextMoveRecommendation = {
  action: PracticeNextAction;
  label: string;
  reason: string;
};

/** Pick the single best next move after a graded answer. */
export function recommendNextMove({
  score,
  canNext,
  hasSample,
}: {
  score: number;
  canNext: boolean;
  hasSample: boolean;
}): NextMoveRecommendation {
  if (score <= 7 && hasSample) {
    return {
      action: "sample",
      label: "Study the sample answer",
      reason:
        score <= 5
          ? "Low score — study a strong sample, then revise your answer below."
          : "Almost there — compare with a strong sample to sharpen it.",
    };
  }
  if (score >= 8) {
    return {
      action: "real_interview",
      label: "Practice in real interview",
      reason: "Strong answer — rehearse it in the real interview setting.",
    };
  }
  if (canNext) {
    return {
      action: "next",
      label: "Next question",
      reason:
        score <= 7
          ? "Apply the feedback below, then keep your momentum going."
          : "Strong answer — keep your momentum going.",
    };
  }
  return {
    action: "finish",
    label: "Finish & view report",
    reason: "Last question done — wrap up and review your session report.",
  };
}

const ACTION_META: Record<
  PracticeNextAction,
  { label: string; icon: typeof RotateCcw }
> = {
  retry: { label: "Retry this answer", icon: RotateCcw },
  sample: { label: "View sample answer", icon: BookOpenText },
  next: { label: "Move next", icon: ArrowRight },
  draft: { label: "Save as draft", icon: Save },
  real_interview: { label: "Practice in real interview", icon: ExternalLink },
  resume_proof: { label: "Add resume proof", icon: FilePlus2 },
  finish: { label: "Finish practice", icon: Flag },
};

/** Inline action row under the latest feedback card. */
export function NextActionStrip({
  feedback,
  canNext,
  disabled = false,
  onAction,
}: {
  feedback: PrepFeedback;
  canNext: boolean;
  disabled?: boolean;
  onAction: (action: PracticeNextAction) => void;
}) {
  const actions: PracticeNextAction[] = [
    "retry",
    ...(feedback.sampleAnswer?.trim() ? (["sample"] as const) : []),
    "real_interview",
    ...(canNext ? (["next"] as const) : []),
    "draft",
  ];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {actions.map((action) => {
        const { label, icon: Icon } = ACTION_META[action];
        return (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal"
            onClick={() => onAction(action)}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/** Thin "Next best move" nudge shown above the composer after coach feedback. */
export function NextBestMoveBar({
  feedback,
  canNext,
  disabled = false,
  onAction,
  onDismiss,
  className,
}: {
  feedback: PrepFeedback;
  canNext: boolean;
  disabled?: boolean;
  onAction: (action: PracticeNextAction) => void;
  onDismiss: () => void;
  className?: string;
}) {
  const hasSample = Boolean(feedback.sampleAnswer?.trim());
  const recommendation = recommendNextMove({
    score: feedback.score,
    canNext,
    hasSample,
  });
  const PrimaryIcon = ACTION_META[recommendation.action].icon;

  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.06] py-1.5 pl-3 pr-2 shadow-sm backdrop-blur-sm",
        className,
      )}
      data-testid="next-best-move"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs leading-tight">
        <span className="font-semibold text-foreground">Next best move</span>
        <span className="text-muted-foreground">
          {" — "}
          {recommendation.reason}
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
        onClick={() => onAction(recommendation.action)}
      >
        <PrimaryIcon className="h-3.5 w-3.5" aria-hidden />
        {recommendation.label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label="Dismiss next best move"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Modal with the coach's sample answer for the current question. */
export function SampleAnswerDialog({
  open,
  onOpenChange,
  sampleAnswer,
  questionText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleAnswer: string;
  questionText?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-primary" aria-hidden />
            Sample answer
          </DialogTitle>
          {questionText ? (
            <DialogDescription className="line-clamp-2">
              {questionText}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-3">
            {sampleAnswer
              .split(/\n\n+/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p
                  key={index}
                  className="text-sm leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
