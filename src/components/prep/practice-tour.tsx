"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    BookOpenCheck,
    CheckCircle2,
    CircleHelp,
    ClipboardList,
    FileText,
    Flag,
    Mic,
    RefreshCw,
    Send,
    Sparkles,
    Target,
    Timer,
    TrendingUp,
    Waves,
} from "lucide-react";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

/** First-run guided tour for the practice interface (mirrors the interviewee tour). */

export interface PracticeTourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  placement: "top" | "bottom" | "left" | "right";
  /** Skipped when the target element is not visible (e.g. desktop-only rails). */
  optional?: boolean;
}

export const PRACTICE_TOUR_STEPS: PracticeTourStep[] = [
  {
    id: "progress",
    selector: '[data-tour="practice-progress"]',
    title: "Track your run",
    description: "See question progress and your best score here.",
    placement: "bottom",
  },
  {
    id: "question",
    selector: '[data-tour="practice-question"]',
    title: "Answer like it's real",
    description: "Answer one prompt at a time, like a real interview.",
    placement: "bottom",
  },
  {
    id: "target",
    selector: '[data-tour="practice-target"]',
    title: "Know the target",
    description: "Use these cues for structure, signals, and timing.",
    placement: "bottom",
    optional: true,
  },
  {
    id: "navigator",
    selector: '[data-tour="practice-navigator"]',
    title: "Jump between questions",
    description: "Check status and jump to any question.",
    placement: "right",
    optional: true,
  },
  {
    id: "composer",
    selector: '[data-tour="practice-composer"]',
    title: "Speak or type your answer",
    description: "Speak or type here, then send for feedback.",
    placement: "top",
  },
  {
    id: "voice-button",
    selector: '[data-tour="practice-voice-button"]',
    title: "Unlock voice delivery grading",
    description:
      "Record audio to grade confidence, clarity, tone, pace, pauses, and fillers.",
    placement: "top",
    optional: true,
  },
  {
    id: "suggested",
    selector: '[data-tour="practice-suggested"]',
    title: "Peek at a model answer",
    description: "Open a tailored sample answer, tune it, or practice it aloud.",
    placement: "left",
    optional: true,
  },
  {
    id: "finish",
    selector: '[data-tour="practice-finish"]',
    title: "Finish for your report",
    description: "Finish anytime to save scores, attempts, and next steps.",
    placement: "top",
    optional: true,
  },
];

export const PRACTICE_TOUR_STORAGE_KEY = "aural_practice_tour_done";

export function isPracticeTourCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PRACTICE_TOUR_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markPracticeTourCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRACTICE_TOUR_STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable
  }
}

function findVisibleTarget(selector: string): Element | null {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll(selector);
  for (const node of Array.from(nodes)) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

interface PracticeTourContextValue {
  active: boolean;
  showWelcome: boolean;
  currentStep: PracticeTourStep | null;
  stepIndex: number;
  totalSteps: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  restart: () => void;
}

const PracticeTourContext = createContext<PracticeTourContextValue | null>(null);

export function usePracticeTour() {
  return useContext(PracticeTourContext);
}

export function PracticeTourProvider({
  /** Delay before the first-run tour invite appears (lets the session UI settle). */
  autoStartDelayMs = 1200,
  children,
}: {
  autoStartDelayMs?: number;
  children: React.ReactNode;
}) {
  const steps = PRACTICE_TOUR_STEPS;
  const [active, setActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isPracticeTourCompleted()) return;
    const timer = setTimeout(() => setShowWelcome(true), autoStartDelayMs);
    return () => clearTimeout(timer);
  }, [autoStartDelayMs]);

  const finish = useCallback(() => {
    setActive(false);
    setShowWelcome(false);
    markPracticeTourCompleted();
  }, []);

  const findNextVisible = useCallback(
    (from: number, direction: 1 | -1): number | null => {
      let idx = from;
      while (idx >= 0 && idx < steps.length) {
        const step = steps[idx];
        if (!step.optional || findVisibleTarget(step.selector)) return idx;
        idx += direction;
      }
      return null;
    },
    [steps],
  );

  const start = useCallback(() => {
    const first = findNextVisible(0, 1);
    setStepIndex(first ?? 0);
    setShowWelcome(false);
    setActive(true);
  }, [findNextVisible]);

  const next = useCallback(() => {
    const nextVisible = findNextVisible(stepIndex + 1, 1);
    if (nextVisible === null) {
      finish();
      return;
    }
    setStepIndex(nextVisible);
  }, [stepIndex, findNextVisible, finish]);

  const prev = useCallback(() => {
    const prevVisible = findNextVisible(stepIndex - 1, -1);
    if (prevVisible !== null) setStepIndex(prevVisible);
  }, [stepIndex, findNextVisible]);

  const skip = useCallback(() => finish(), [finish]);

  const restart = useCallback(() => {
    start();
  }, [start]);

  const currentStep = active ? steps[stepIndex] ?? null : null;

  const value = useMemo(
    () => ({
      active,
      showWelcome,
      currentStep,
      stepIndex,
      totalSteps: steps.length,
      start,
      next,
      prev,
      skip,
      restart,
    }),
    [
      active,
      showWelcome,
      currentStep,
      stepIndex,
      steps.length,
      start,
      next,
      prev,
      skip,
      restart,
    ],
  );

  return (
    <PracticeTourContext.Provider value={value}>
      {children}
    </PracticeTourContext.Provider>
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;

function PracticeWelcomeIllustration() {
  return (
    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-orange-50 px-6 pb-0 pt-6 dark:from-primary/20 dark:via-background dark:to-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/docs/practices-session.webp"
        alt="Practice interface preview"
        className="block h-48 w-full rounded-t-lg object-cover object-top shadow-sm"
      />
      <div className="absolute -bottom-px left-0 right-0 h-6 bg-gradient-to-t from-white/95 to-transparent dark:from-zinc-900/95" />
    </div>
  );
}

function IllustrationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      {children}
    </div>
  );
}

function PracticeProgressIllustration() {
  return (
    <IllustrationShell>
      <div className="w-52 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-foreground">Practice run</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
            Q7 / 8
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-full w-4/5 rounded-full bg-primary" />
        </div>
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-primary" />
            Best 3.0
          </span>
          <span>1 to retry</span>
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeQuestionIllustration() {
  return (
    <IllustrationShell>
      <div className="w-52 rounded-lg border bg-card p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold text-primary">
          <BookOpenCheck className="h-3 w-3" />
          Question 7
        </div>
        <div className="space-y-1.5 text-[8px] text-foreground">
          <div className="h-2 w-full rounded bg-muted" />
          <div className="h-2 w-10/12 rounded bg-muted" />
          <div className="h-2 w-8/12 rounded bg-muted" />
        </div>
        <div className="mt-2 flex gap-1">
          <span className="rounded-full border px-1.5 py-0.5 text-[8px]">Intro arc</span>
          <span className="rounded-full border px-1.5 py-0.5 text-[8px]">60-90s</span>
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeTargetIllustration() {
  return (
    <IllustrationShell>
      <div className="grid w-56 grid-cols-[auto_1fr] gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          {["Structure", "Signals", "Timing"].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
              <span className="text-[9px] font-medium">{label}</span>
              <div className="h-1 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeNavigatorIllustration() {
  return (
    <IllustrationShell>
      <div className="w-52 rounded-lg border bg-card p-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold">
          <ClipboardList className="h-3 w-3 text-primary" />
          Questions
        </div>
        <div className="space-y-1">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={cn(
                "flex items-center justify-between rounded-md px-1.5 py-1 text-[8px]",
                item === 3 ? "border border-primary/40 bg-primary/10" : "bg-muted/60",
              )}
            >
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/50" />
                Q{item}
              </span>
              {item === 3 ? <span className="font-semibold text-primary">retry</span> : null}
            </div>
          ))}
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeComposerIllustration() {
  return (
    <IllustrationShell>
      <div className="w-56 rounded-xl border bg-card p-2">
        <div className="mb-2 h-9 rounded-md bg-muted px-2 py-1.5 text-[9px] text-muted-foreground">
          Speak or edit your transcript...
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <span className="rounded-md bg-muted px-1.5 py-1 text-[8px]">Previous</span>
            <span className="rounded-md bg-muted px-1.5 py-1 text-[8px]">Next</span>
          </div>
          <div className="flex gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border text-primary">
              <Mic className="h-3.5 w-3.5" />
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Send className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeVoiceButtonIllustration() {
  return (
    <IllustrationShell>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Mic className="h-5 w-5" />
          </div>
          <span className="text-[9px] font-semibold text-primary">Voice</span>
        </div>
        <div className="w-36 rounded-lg border bg-card p-2">
          <div className="mb-1 flex items-center gap-1 text-[8px] font-semibold text-primary">
            <Waves className="h-3 w-3" />
            Delivery scores
          </div>
          {["Confidence", "Clarity", "Tone"].map((label, index) => (
            <div key={label} className="mb-1 flex items-center gap-1.5">
              <span className="w-12 text-[7px] text-muted-foreground">{label}</span>
              <div className="h-1 flex-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${70 + index * 8}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeSuggestedIllustration() {
  return (
    <IllustrationShell>
      <div className="w-52 rounded-lg border bg-card p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold text-primary">
          <Sparkles className="h-3 w-3" />
          Suggested answer
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-1.5 text-[8px]">
              <span className="font-semibold text-primary">{item}.</span>
              <div className="h-1.5 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[8px] text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          Tune and practice aloud
        </div>
      </div>
    </IllustrationShell>
  );
}

function PracticeFinishIllustration() {
  return (
    <IllustrationShell>
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Flag className="h-5 w-5" />
        </div>
        <div className="w-36 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold">
            <FileText className="h-3 w-3 text-primary" />
            Practice report
          </div>
          <div className="rounded-md border bg-card px-2 py-1.5 text-[8px]">
            scores, attempts, next run
          </div>
          <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground">
            <Timer className="h-3 w-3" />
            saved for review
          </div>
        </div>
      </div>
    </IllustrationShell>
  );
}

const PRACTICE_STEP_ILLUSTRATIONS: Record<string, React.ReactNode> = {
  progress: <PracticeProgressIllustration />,
  question: <PracticeQuestionIllustration />,
  target: <PracticeTargetIllustration />,
  navigator: <PracticeNavigatorIllustration />,
  composer: <PracticeComposerIllustration />,
  "voice-button": <PracticeVoiceButtonIllustration />,
  suggested: <PracticeSuggestedIllustration />,
  finish: <PracticeFinishIllustration />,
};

function getPracticeStepIllustration(stepId: string): React.ReactNode | null {
  return PRACTICE_STEP_ILLUSTRATIONS[stepId] ?? null;
}

export function PracticeTourOverlay() {
  const tour = usePracticeTour();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const scrolledStepRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const findAndMeasure = useCallback(() => {
    if (!tour?.currentStep) {
      setTargetRect(null);
      return;
    }
    const el = findVisibleTarget(tour.currentStep.selector);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    // Bring offscreen targets into view once per step (the chat thread scrolls).
    if (
      scrolledStepRef.current !== tour.currentStep.id &&
      (r.top < 0 || r.bottom > window.innerHeight)
    ) {
      scrolledStepRef.current = tour.currentStep.id;
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      return;
    }
    scrolledStepRef.current = tour.currentStep.id;

    const rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    setTargetRect(rect);

    const step = tour.currentStep;
    const tt = tooltipRef.current;
    const ttH = tt?.offsetHeight ?? 150;
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

  if (!tour || !mounted) return null;

  if (tour.showWelcome) {
    return createPortal(
      <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
        <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/30 bg-white shadow-2xl dark:bg-zinc-900">
          <PracticeWelcomeIllustration />
          <div className="space-y-3 px-8 pb-8 pt-2 text-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-50">
              Welcome to practice mode!
            </h3>
            <p className="text-[15px] font-medium text-gray-700 dark:text-zinc-200">
              Take a quick tour of the practice interface.
            </p>
            <p className="text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
              We&apos;ll show the key controls: progress, targets, voice,
              feedback, and sample answers.
            </p>
            <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:items-stretch">
              <Button
                variant="ghost"
                size="lg"
                className="text-muted-foreground"
                onClick={tour.skip}
              >
                Skip for now
              </Button>
              <Button className="sm:flex-1" size="lg" onClick={tour.start}>
                Take a quick tour
              </Button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  if (!tour.active) return null;

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
            {getPracticeStepIllustration(step.id)}
            <h3 className="text-sm font-bold leading-tight text-foreground">
              {step.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {step.description}
            </p>
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

/** Header help button that replays the practice tour. */
export function PracticeTourHelpButton({ className }: { className?: string }) {
  const tour = usePracticeTour();
  if (!tour) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", className)}
      onClick={tour.restart}
      aria-label="Replay practice tour"
      title="Replay practice tour"
    >
      <CircleHelp className="h-4 w-4" />
    </Button>
  );
}
