"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getStepIllustration } from "./interviewee-guide-content";
import { useIntervieweeTour } from "./interviewee-tour-provider";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;

export function IntervieweeTourOverlay() {
  const tour = useIntervieweeTour();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const findAndMeasure = useCallback(() => {
    if (!tour?.currentStep) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(tour.currentStep.selector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    setTargetRect(rect);

    const step = tour.currentStep;
    const tt = tooltipRef.current;
    const ttH = tt?.offsetHeight ?? 160;
    let top = 0;
    let left = 0;
    switch (step.placement) {
      case "bottom":
        top = rect.top + rect.height + PADDING + TOOLTIP_GAP;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        break;
      case "top":
        top = rect.top - PADDING - TOOLTIP_GAP - ttH;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        break;
      case "right":
        top = rect.top + rect.height / 2 - ttH / 2;
        left = rect.left + rect.width + PADDING + TOOLTIP_GAP;
        break;
      case "left":
        top = rect.top + rect.height / 2 - ttH / 2;
        left = rect.left - PADDING - TOOLTIP_GAP - TOOLTIP_WIDTH;
        break;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - ttH - 12));
    setTooltipPos({ top, left });
  }, [tour?.currentStep]);

  useEffect(() => {
    if (!tour?.active || !tour.currentStep) return;
    findAndMeasure();

    const handleLayout = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(findAndMeasure);
    };
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);

    const observer = new MutationObserver(handleLayout);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-tour"],
    });

    const interval = setInterval(findAndMeasure, 500);
    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      clearInterval(interval);
    };
  }, [tour?.active, tour?.currentStep, findAndMeasure]);

  if (!tour || !mounted || !tour.active) return null;

  const { currentStep: step, stepIndex: idx, totalSteps: total } = tour;
  const isLast = idx === total - 1;

  const spotlight =
    step && targetRect
      ? {
          top: targetRect.top - PADDING,
          left: targetRect.left - PADDING,
          width: targetRect.width + PADDING * 2,
          height: targetRect.height + PADDING * 2,
        }
      : null;

  return createPortal(
    <div aria-live="polite">
      {/* Backdrop with spotlight cutout */}
      {spotlight && (
        <div
          className="fixed inset-0 z-[9998] transition-all duration-300"
          style={{
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            borderRadius: 8,
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Click-blocking regions around spotlight */}
      {spotlight && (
        <>
          <div
            className="fixed z-[9997]"
            style={{ top: 0, left: 0, width: "100%", height: spotlight.top }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top + spotlight.height,
              left: 0,
              width: "100%",
              bottom: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top,
              left: 0,
              width: spotlight.left,
              height: spotlight.height,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}

      {/* Tooltip */}
      {spotlight && step && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] rounded-xl border border-border/50 bg-white shadow-2xl dark:bg-zinc-900"
          style={{ top: tooltipPos.top, left: tooltipPos.left, width: TOOLTIP_WIDTH }}
        >
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {idx + 1} of {total}
              </span>
            </div>
            {getStepIllustration(step.id)}
            <h3 className="text-sm font-bold leading-tight text-foreground">
              {step.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {step.description}
            </p>
            {/* Progress bar */}
            <div className="pt-0.5">
              <div className="h-1 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${((idx + 1) / total) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <button
                onClick={tour.skip}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip tour
              </button>
              <div className="flex gap-1.5">
                {idx > 0 && (
                  <button
                    onClick={tour.prev}
                    className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={isLast ? tour.skip : tour.next}
                  className="inline-flex items-center rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {isLast ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
