"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

export type CoachSpeakingPhase = "loading" | "playing";

type Props = {
  phase: CoachSpeakingPhase;
  className?: string;
  loadingLabel?: string;
  playingLabel?: string;
  onStop?: () => void;
};

/** Visible feedback while the AI coach TTS is loading or playing. */
export function CoachSpeakingIndicator({
  phase,
  className,
  loadingLabel = "Preparing coach voice…",
  playingLabel = "AI coach is speaking",
  onStop,
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const level =
    phase === "playing"
      ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tick * 0.45))
      : 0.15;

  const bars = Array.from({ length: 32 }).map((_, i) => {
    const wobble = Math.sin((i + tick) * 0.55) * 0.35 + 0.65;
    const h = 4 + level * wobble * 22;
    return (
      <div
        key={i}
        className={cn(
          "w-[3px] shrink-0 rounded-full transition-all duration-100",
          phase === "playing" ? "bg-primary/80" : "bg-primary/40",
        )}
        style={{ height: `${h}px` }}
      />
    );
  });

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={phase === "loading" ? loadingLabel : playingLabel}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {phase === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Volume2 className="h-4 w-4 animate-pulse" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold text-primary">AI coach</span>
        <span className="text-xs text-muted-foreground">
          {phase === "loading" ? loadingLabel : playingLabel}
        </span>
      </div>
      <div className="flex h-8 min-w-[72px] max-w-[120px] flex-1 items-end justify-between gap-px px-1">
        {bars}
      </div>
      {onStop ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={onStop}
          aria-label="Stop coach voice"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      ) : null}
    </div>
  );
}
