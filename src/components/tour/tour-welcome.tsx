"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useTourSafe } from "./tour-provider";

export function TourWelcome() {
  const tour = useTourSafe();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !tour?.showWelcome) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10010] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={tour.dismissWelcome}
      />

      <div className="tour-tooltip-enter relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-border/30 overflow-hidden">
        {/* Illustration header */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-orange-50 px-6 pt-6 pb-0">
          <Image
            src="/images/marketing/hero-screenshots-sm.webp"
            alt="Aural platform preview"
            width={800}
            height={450}
            className="w-full h-auto rounded-t-lg"
            priority
          />
          <div className="absolute -bottom-px left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
        </div>

        {/* Content */}
        <div className="px-8 pb-8 pt-2 text-center space-y-3">
          <h2 className="text-xl font-bold text-gray-900">
            Welcome to Aural!
          </h2>
          <p className="text-[15px] font-medium text-gray-700">
            Explore each section with this quick guided tour.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            We&apos;ll walk you through creating your first AI-powered interview,
            adding candidates, and sharing invite links — everything you need to
            get started.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={tour.dismissWelcome}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Remind me next time
            </button>
            <button
              onClick={tour.acceptWelcome}
              className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors shadow-sm"
            >
              Let&apos;s dive in!
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
