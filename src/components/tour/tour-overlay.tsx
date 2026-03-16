"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTourSafe } from "./tour-provider";
import { TOUR_STEPS } from "./tour-steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;

function renderDescription(desc: string) {
  const parts = desc.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="text-primary">
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function TourOverlay() {
  const tour = useTourSafe();
  const router = useRouter();
  const pathname = usePathname();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const rafRef = useRef<number>(0);
  const [inputFilled, setInputFilled] = useState(false);
  const scrolledForStepRef = useRef<string>("");
  const [mounted, setMounted] = useState(false);
  const [maxStep, setMaxStep] = useState(tour?.stepIndex ?? 0);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const idx = tour?.stepIndex ?? 0;
    setMaxStep((prev) => Math.max(prev, idx));
  }, [tour?.stepIndex]);

  // --- Input-fill check (Next stays disabled until requireInput is satisfied) ---
  useEffect(() => {
    const reqSel = tour?.currentStep?.requireInput;
    if (!tour?.active || !reqSel) {
      setInputFilled(false);
      return;
    }
    setInputFilled(false);
    const check = () => {
      const el = document.querySelector(reqSel) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      setInputFilled(!!el?.value?.trim());
    };
    check();
    const handler = () => check();
    document.addEventListener("input", handler, true);
    const iv = setInterval(check, 400);
    return () => {
      document.removeEventListener("input", handler, true);
      clearInterval(iv);
    };
  }, [tour?.active, tour?.currentStep?.id, tour?.currentStep?.requireInput]);

  // --- Measure target position + tooltip placement ---
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
    const ttH = tt?.offsetHeight ?? 180;
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
    left = Math.max(16, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - ttH - 16));
    setTooltipPos({ top, left });
  }, [tour?.currentStep]);

  // --- Reset refs when tour deactivates ---
  useEffect(() => {
    if (!tour?.active) {
      scrolledForStepRef.current = "";
    }
  }, [tour?.active]);

  // --- Recovery: showKey resets refs ---
  useEffect(() => {
    if (!tour?.showKey) return;
    scrolledForStepRef.current = "";
  }, [tour?.showKey]);

  // --- Scroll to target once found ---
  useEffect(() => {
    if (!tour?.active || !tour.currentStep || !targetRect) return;
    const key = `${tour.currentStep.id}:${tour.showKey ?? 0}`;
    if (scrolledForStepRef.current === key) return;
    const el = document.querySelector(tour.currentStep.selector);
    if (!el) return;
    scrolledForStepRef.current = key;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [tour?.active, tour?.currentStep, tour?.showKey, targetRect]);

  // --- Auto-advance when a specified element appears in the DOM (polling) ---
  useEffect(() => {
    const selector = tour?.currentStep?.advanceOnAppear;
    if (!tour?.active || !selector) return;
    let done = false;
    const check = () => {
      if (done) return;
      if (document.querySelector(selector)) {
        done = true;
        tour.next();
      }
    };
    check();
    if (!done) {
      const iv = setInterval(check, 150);
      return () => { done = true; clearInterval(iv); };
    }
  }, [tour?.active, tour?.currentStep?.id, tour?.currentStep?.advanceOnAppear, tour?.next, tour]);

  // --- Auto-advance pointer handler (pointerdown so Radix dropdowns work) ---
  useEffect(() => {
    if (!tour?.active || !tour.currentStep || tour.currentStep.noAutoAdvance)
      return;
    const selector = tour.currentStep.selector;
    const handleTargetPointer = () => tour.next();
    const attach = () => {
      const el = document.querySelector(selector);
      if (el) {
        el.addEventListener("pointerdown", handleTargetPointer, { once: true });
        return () => el.removeEventListener("pointerdown", handleTargetPointer);
      }
      return undefined;
    };
    let cleanup = attach();
    const mo = new MutationObserver(() => {
      cleanup?.();
      cleanup = attach();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cleanup?.();
      mo.disconnect();
    };
  }, [
    tour?.active,
    tour?.currentStep?.id,
    tour?.currentStep?.noAutoAdvance,
    tour?.next,
    tour,
  ]);

  // --- Layout / resize / mutation listener ---
  useEffect(() => {
    if (!tour?.active || !tour.currentStep) return;
    findAndMeasure();
    const handleLayout = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(findAndMeasure);
    };
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    observerRef.current = new MutationObserver(handleLayout);
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-tour"],
    });
    const interval = setInterval(findAndMeasure, 500);
    return () => {
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
      observerRef.current?.disconnect();
      cancelAnimationFrame(rafRef.current);
      clearInterval(interval);
    };
  }, [tour?.active, tour?.currentStep, findAndMeasure]);

  // --- Derived: is the spotlight + tooltip visible right now? ---
  const spotlight =
    tour?.active && tour?.currentStep && targetRect
      ? {
          top: targetRect.top - PADDING,
          left: targetRect.left - PADDING,
          width: targetRect.width + PADDING * 2,
          height: targetRect.height + PADDING * 2,
        }
      : null;

  if (!tour || !mounted) return null;

  const step = tour.currentStep;
  const idx = tour.stepIndex;
  const total = tour.totalSteps;
  const isLast = idx === total - 1;

  const handleBack = () => {
    const prevIdx = Math.max(0, idx - 1);
    const prevStep = TOUR_STEPS[prevIdx];
    tour.prev();
    if (prevStep && !pathname.includes(prevStep.page)) {
      const url = prevStep.page.startsWith("/edit/") ? undefined : prevStep.page;
      if (url) router.push(url);
    }
  };

  const handleNext = () => {
    const nextIdx = idx + 1;
    const nextStep = TOUR_STEPS[nextIdx];
    tour.next();
    if (nextStep && !pathname.includes(nextStep.page)) {
      const url = nextStep.page.startsWith("/edit/") ? undefined : nextStep.page;
      if (url) router.push(url);
    }
  };

  return createPortal(
    <div className="tour-overlay" aria-live="polite">
      {/* Backdrop with spotlight cutout */}
      {spotlight && (
        <div
          className="fixed inset-0 z-[9998] transition-all duration-300"
          style={{
            boxShadow: "0 0 0 9999px rgba(51,51,51,0.6)",
            borderRadius: 8,
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Click-blocking regions around the spotlight */}
      {spotlight && (
        <>
          <div
            className="fixed z-[9997]"
            style={{ top: 0, left: 0, width: "100%", height: spotlight.top }}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top + spotlight.height,
              left: 0,
              width: "100%",
              bottom: 0,
            }}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top,
              left: 0,
              width: spotlight.left,
              height: spotlight.height,
            }}
          />
          <div
            className="fixed z-[9997]"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
          />
        </>
      )}

      {/* Tooltip */}
      {spotlight && step && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-80 rounded-xl bg-white shadow-2xl border border-border/50 tour-tooltip-enter"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Step {idx + 1} of {total}
              </span>
            </div>
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
              {step.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {renderDescription(step.description)}
            </p>
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-gray-500">
                  {Math.round(((idx + 1) / total) * 100)}% complete
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${((idx + 1) / total) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={tour.skip}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                Skip tour
              </button>
              <div className="flex gap-2">
                {idx > 0 && (
                  <button
                    onClick={handleBack}
                    className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={!isLast && !inputFilled && idx >= maxStep}
                  className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLast ? "Finish" : "Next"}
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
