"use client";

import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildAnswerTarget } from "@/lib/prep/answer-targets";
import { cn } from "@/lib/utils";
import { Clock, Crosshair, ListChecks } from "lucide-react";
import { useMemo } from "react";

/**
 * "Answer target" chips under a practice question: recommended structure,
 * expected signals, and suggested answer length.
 */
export function AnswerTargetChips({
  questionType,
  questionText,
  className,
  "data-tour": dataTour,
}: {
  questionType?: string | null;
  questionText: string;
  className?: string;
  "data-tour"?: string;
}) {
  const target = useMemo(
    () => buildAnswerTarget(questionType, questionText),
    [questionType, questionText],
  );

  return (
    <div
      data-tour={dataTour}
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-lg border border-dashed border-border/80 bg-muted/30 px-2.5 py-1.5",
        className,
      )}
    >
      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Aim for
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-default gap-1 font-normal">
            <Crosshair className="h-3 w-3 text-primary" aria-hidden />
            {target.structureLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {target.structureHint}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-default gap-1 font-normal">
            <Clock className="h-3 w-3" aria-hidden />
            {target.lengthLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          About {target.wordsLabel} spoken
        </TooltipContent>
      </Tooltip>
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <ListChecks className="h-3 w-3" aria-hidden />
        {target.signals.join(" · ")}
      </span>
    </div>
  );
}
