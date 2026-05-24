"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

export type StreamPanelPhase = "idle" | "thinking" | "writing" | "finalizing";

type Props = {
  phase: StreamPanelPhase;
  thinkingText?: string;
  contentText?: string;
  thinkingLabel?: string;
  thinkingCompleteLabel?: string;
  contentLabel?: string;
  contentCompleteLabel?: string;
  className?: string;
};

/** Shared streaming panels (interview AI generator + practice coaching). */
export function StreamingTextPanels({
  phase,
  thinkingText = "",
  contentText = "",
  thinkingLabel = "Thinking",
  thinkingCompleteLabel = "Thought complete",
  contentLabel = "Writing",
  contentCompleteLabel = "Finalizing",
  className,
}: Props) {
  const thinkingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thinkingRef.current?.scrollTo({ top: thinkingRef.current.scrollHeight });
  }, [thinkingText]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
  }, [contentText]);

  if (!thinkingText && !contentText) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {thinkingText ? (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {phase === "thinking" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            <span>
              {phase === "thinking" ? thinkingLabel : thinkingCompleteLabel}
            </span>
          </div>
          <div
            ref={thinkingRef}
            className={cn(
              "overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar",
              phase === "thinking" ? "max-h-40" : "max-h-20",
            )}
          >
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {thinkingText}
            </p>
          </div>
        </div>
      ) : null}
      {contentText ? (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {phase === "writing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            <span>
              {phase === "writing" || phase === "thinking"
                ? contentLabel
                : contentCompleteLabel}
            </span>
          </div>
          <div
            ref={contentRef}
            className="max-h-48 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar"
          >
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {contentText}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
