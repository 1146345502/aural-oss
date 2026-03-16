"use client";

import confetti from "canvas-confetti";
import { PartyPopper } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTourSafe } from "./tour-provider";

const BRAND_COLORS = [
  "#A0522D",
  "#EC9D71",
  "#F3C1A1",
  "#FFBF00",
  "#FCD34D",
  "#6B8E7A",
  "#8EC2A2",
];

function fireConfetti() {
  const duration = 1000;
  const end = Date.now() + duration;

  const burst = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: BRAND_COLORS,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: BRAND_COLORS,
    });

    if (Date.now() < end) {
      requestAnimationFrame(burst);
    }
  };

  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.6 },
    colors: BRAND_COLORS,
  });

  burst();
}

export function TourCelebration() {
  const tour = useTourSafe();
  const [mounted, setMounted] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const handleDismiss = useCallback(() => {
    tour?.dismissCelebration();
    firedRef.current = false;
  }, [tour]);

  useEffect(() => {
    if (tour?.showCelebration && !firedRef.current) {
      firedRef.current = true;
      fireConfetti();
    }
  }, [tour?.showCelebration]);

  if (!mounted || !tour?.showCelebration) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-center justify-center pointer-events-none">
      <div className="tour-tooltip-enter pointer-events-auto relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-border/30 overflow-hidden">
        <div className="flex flex-col items-center px-8 pt-10 pb-8 text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>

          <h2 className="text-xl font-bold text-gray-900">
            Congratulations!
          </h2>

          <p className="text-sm text-gray-600 leading-relaxed max-w-[280px]">
            You&apos;ve created your first interview! Open the copied invite link to experience it yourself, then share it with candidates.
          </p>

          <button
            onClick={handleDismiss}
            className="mt-2 w-full inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors shadow-sm"
          >
            Start exploring
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
