"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Check, RotateCcw, Play, X, EyeOff } from "lucide-react";
import { useTourSafe } from "./tour-provider";
import { TOUR_STEPS, TOUR_EDIT_URL_KEY, type TourStep } from "./tour-steps";

function getStepNavUrl(step: TourStep): string | null {
  if (step.page.startsWith("/edit/")) {
    try {
      return localStorage.getItem(TOUR_EDIT_URL_KEY);
    } catch {
      return null;
    }
  }
  return step.page;
}

interface TourChecklistProps {
  open: boolean;
  onClose: () => void;
}

export function TourChecklist({ open, onClose }: TourChecklistProps) {
  const tour = useTourSafe();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    let removePointer: (() => void) | undefined;
    let removeEsc: (() => void) | undefined;

    const raf = requestAnimationFrame(() => {
      const handlePointer = (e: PointerEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("pointerdown", handlePointer);
      document.addEventListener("keydown", handleEsc);
      removePointer = () =>
        document.removeEventListener("pointerdown", handlePointer);
      removeEsc = () =>
        document.removeEventListener("keydown", handleEsc);
    });

    return () => {
      cancelAnimationFrame(raf);
      removePointer?.();
      removeEsc?.();
    };
  }, [open, onClose]);

  if (!mounted || !open || !tour) return null;

  const progress = tour.completed
    ? 100
    : Math.round((tour.stepIndex / tour.totalSteps) * 100);

  const handleContinue = () => {
    onClose();
    const step = TOUR_STEPS[tour.stepIndex];
    if (step && !pathname.includes(step.page)) {
      const url = getStepNavUrl(step);
      if (url) router.push(url);
    }
    tour.goToStep(tour.stepIndex);
  };

  const handleRestart = () => {
    onClose();
    if (!pathname.includes("/organizations")) {
      router.push("/organizations");
    }
    tour.goToStep(0);
  };

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: 56, right: 16, width: 320, zIndex: 10003 }}
      className="rounded-xl border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">
            Getting Started
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {progress}% complete
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="space-y-0.5 max-h-64 overflow-y-auto code-scrollbar -mx-2">
          {TOUR_STEPS.map((step, i) => {
            const done = tour.completed || i < tour.stepIndex;
            const current = !tour.completed && i === tour.stepIndex;
            return (
              <li
                key={step.id}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${current ? "bg-primary/5" : ""}`}
              >
                {done ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : current ? (
                  <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30" />
                )}
                <span
                  className={
                    done
                      ? "text-muted-foreground"
                      : current
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/70"
                  }
                >
                  {step.title}
                </span>
              </li>
            );
          })}
        </ul>

        {!tour.completed ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <button
                onClick={handleRestart}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Restart
              </button>
              <button
                onClick={handleContinue}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Play className="h-3 w-3" />
                Continue
              </button>
            </div>
            <button
              onClick={() => { onClose(); tour.dismiss(); }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <EyeOff className="h-3 w-3" />
              Dismiss tour
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={handleRestart}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Restart Tour
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
