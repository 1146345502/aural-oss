"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    CHAT_TOUR_STEPS,
    markTourCompleted,
    VOICE_TOUR_STEPS,
    type IntervieweeTourStep,
} from "./interviewee-tour-steps";

interface IntervieweeTourContextValue {
  active: boolean;
  finished: boolean;
  steps: IntervieweeTourStep[];
  currentStep: IntervieweeTourStep | null;
  stepIndex: number;
  totalSteps: number;
  next: () => void;
  prev: () => void;
  skip: () => void;
  restart: () => void;
}

const IntervieweeTourContext =
  createContext<IntervieweeTourContextValue | null>(null);

export function useIntervieweeTour() {
  return useContext(IntervieweeTourContext);
}

export function IntervieweeTourProvider({
  mode,
  startImmediately = false,
  children,
}: {
  mode: "voice" | "chat";
  /** Start the tour right away (used by the preview layout) */
  startImmediately?: boolean;
  children: React.ReactNode;
}) {
  const steps = mode === "voice" ? VOICE_TOUR_STEPS : CHAT_TOUR_STEPS;
  const [active, setActive] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (startImmediately) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [startImmediately]);

  const finish = useCallback(() => {
    setActive(false);
    setFinished(true);
    markTourCompleted();
  }, []);

  const findNextVisible = useCallback(
    (from: number, direction: 1 | -1): number | null => {
      let idx = from;
      while (idx >= 0 && idx < steps.length) {
        const step = steps[idx];
        if (!step.optional || document.querySelector(step.selector)) return idx;
        idx += direction;
      }
      return null;
    },
    [steps],
  );

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

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const restart = useCallback(() => {
    setStepIndex(0);
    setFinished(false);
    setActive(true);
  }, []);

  const currentStep = active ? steps[stepIndex] ?? null : null;

  const value = useMemo(
    () => ({
      active,
      finished,
      steps,
      currentStep,
      stepIndex,
      totalSteps: steps.length,
      next,
      prev,
      skip,
      restart,
    }),
    [active, finished, steps, currentStep, stepIndex, next, prev, skip, restart],
  );

  return (
    <IntervieweeTourContext.Provider value={value}>
      {children}
    </IntervieweeTourContext.Provider>
  );
}
