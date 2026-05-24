"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export type CoachSpeakingPhase = "loading" | "playing";

const BAR_COUNT = 20;
const MAX_HALF_PX = 18;

type Props = {
  phase: CoachSpeakingPhase;
  className?: string;
};

/** Fixed-height waveform so the question card does not resize while speaking. */
export function CoachSpeakingWave({ phase, className }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);

  const level = phase === "playing" ? 0.55 : 0.35;

  return (
    <div
      className={cn(
        "flex h-10 w-[152px] shrink-0 items-center justify-end",
        className,
      )}
      role="status"
      aria-label={phase === "loading" ? "Coach preparing" : "Coach speaking"}
    >
      {phase === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
      ) : (
        <div className="relative flex h-10 w-full items-center">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dotted border-primary/30" />
          <div className="relative flex h-10 w-full items-center justify-between gap-[2px]">
            {Array.from({ length: BAR_COUNT }).map((_, i) => {
              const barVariance = Math.sin((i + tick) * 0.7) * 0.3 + 0.7;
              const halfH = Math.max(2, level * barVariance * MAX_HALF_PX);
              return (
                <div
                  key={i}
                  className="w-1 shrink-0 rounded-full bg-primary transition-all duration-150"
                  style={{ height: `${halfH * 2}px` }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
