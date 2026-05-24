"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  active?: boolean;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  roundedClassName?: string;
};

/** Animated rainbow border ring (spinner behind an opaque inner surface). */
export function AiGlowBorder({
  active = false,
  children,
  className,
  innerClassName,
  roundedClassName = "rounded-xl",
}: Props) {
  if (!active) {
    return <div className={className}>{children}</div>;
  }

  const innerRadius =
    roundedClassName === "rounded-xl"
      ? "rounded-[10px]"
      : roundedClassName === "rounded-lg"
        ? "rounded-[6px]"
        : roundedClassName;

  return (
    <div
      className={cn(
        "relative overflow-hidden p-[1.5px] ai-border-spin",
        roundedClassName,
        className,
      )}
    >
      <div
        className={cn(
          "relative z-[1] min-w-0 bg-card",
          innerRadius,
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
