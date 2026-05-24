"use client";

import { cn } from "@/lib/utils";
import { Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

type Props = {
  level: number;
  elapsedMs: number;
  onStop?: () => void;
  className?: string;
  expanded?: boolean;
  inline?: boolean;
};

function CodexCenteredBars({
  level,
  tick,
  barCount,
}: {
  level: number;
  tick: number;
  barCount: number;
}) {
  const maxHalfPx = 14;

  return (
    <div className="relative flex h-10 min-w-0 flex-1 items-center">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dotted border-muted-foreground/45" />
      <div className="relative flex h-10 w-full items-center justify-between gap-px">
        {Array.from({ length: barCount }).map((_, i) => {
          const wobble = Math.sin((i + tick) * 0.55) * 0.35 + 0.65;
          const active = level > 0.02;
          const halfH = active
            ? Math.max(2, level * wobble * maxHalfPx)
            : 2;
          return (
            <div
              key={i}
              className={cn(
                "w-[2px] shrink-0 rounded-full transition-all duration-100",
                active ? "bg-foreground/85" : "bg-muted-foreground/40",
              )}
              style={{ height: `${halfH * 2}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Live recording indicator with level-driven bars. */
export function RecordingWaveform({
  level,
  elapsedMs,
  onStop,
  className,
  expanded = false,
  inline = false,
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  if (inline) {
    return (
      <div
        className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
        aria-live="polite"
        aria-label="Recording"
      >
        <CodexCenteredBars level={level} tick={tick} barCount={96} />
        <span className="shrink-0 tabular-nums text-xs font-medium text-muted-foreground">
          {formatElapsed(elapsedMs)}
        </span>
        {onStop ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={onStop}
            aria-label="Stop recording"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : null}
      </div>
    );
  }

  const barCount = expanded ? 72 : 24;
  const maxBarPx = expanded ? 36 : 28;

  if (expanded) {
    return (
      <div
        className={cn("flex w-full min-h-[48px] items-center gap-3", className)}
        aria-live="polite"
        aria-label="Recording"
      >
        <div className="flex h-10 min-w-0 flex-1 items-center justify-between gap-px rounded-md bg-muted/25 px-2 py-1.5">
          {Array.from({ length: barCount }).map((_, i) => {
            const wobble = Math.sin((i + tick) * 0.55) * 0.35 + 0.65;
            const h = 4 + level * wobble * maxBarPx;
            return (
              <div
                key={i}
                className={cn(
                  "w-[2px] shrink-0 rounded-full transition-all duration-100",
                  level > 0.02 ? "bg-foreground/85" : "bg-muted-foreground/35",
                )}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
        <span className="shrink-0 tabular-nums text-sm font-medium text-muted-foreground">
          {formatElapsed(elapsedMs)}
        </span>
        {onStop ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={onStop}
            aria-label="Stop recording"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[44px] items-center gap-3 rounded-lg bg-muted/40 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-end justify-between gap-px">
        {Array.from({ length: barCount }).map((_, i) => {
          const wobble = Math.sin((i + tick) * 0.55) * 0.35 + 0.65;
          const h = 4 + level * wobble * maxBarPx;
          return (
            <div
              key={i}
              className={cn(
                "w-[3px] shrink-0 rounded-full transition-all duration-100",
                level > 0.02 ? "bg-foreground/85" : "bg-muted-foreground/35",
              )}
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>
      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
        {formatElapsed(elapsedMs)}
      </span>
      {onStop ? (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md"
          onClick={onStop}
          aria-label="Stop recording"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      ) : null}
    </div>
  );
}
