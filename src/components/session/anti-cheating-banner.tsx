"use client";

import type { AntiCheatingViolation } from "@/hooks/use-anti-cheating";
import { useAntiCheating } from "@/hooks/use-anti-cheating";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "@/locales";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AntiCheatingGuardProps {
  enabled: boolean;
  sessionId?: string;
  language?: string;
}

export function AntiCheatingGuard({ enabled, sessionId, language }: AntiCheatingGuardProps) {
  const t = useTranslations(language);
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(false);
  const [departureCount, setDepartureCount] = useState(0);
  const lastDepartureTs = useRef(0);
  const lastPasteToast = useRef(0);

  const reportMutation = trpc.session.reportAntiCheatingViolation.useMutation();

  const persistViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      if (!sessionId) return;
      reportMutation.mutate({
        sessionId,
        violation: {
          type: violation.type,
          timestamp: violation.timestamp,
          detail: violation.detail,
        },
      });
    },
    [sessionId, reportMutation],
  );

  const recordDeparture = useCallback(() => {
    const now = Date.now();
    if (now - lastDepartureTs.current < 500) return;
    lastDepartureTs.current = now;
    setDepartureCount((prev) => prev + 1);
    setWarningOpen(true);
  }, []);

  const handleViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      persistViolation(violation);

      switch (violation.type) {
        case "page_departure":
          recordDeparture();
          break;

        case "paste": {
          const now = Date.now();
          if (now - lastPasteToast.current < 3000) return;
          lastPasteToast.current = now;
          toast({
            title: ((<span className="text-red-600 dark:text-red-400">{t.antiCheatingBanner.pasteBlockedTitle}</span>) as unknown as string),
            description: t.antiCheatingBanner.pasteBlockedBody,
          });
          break;
        }

        case "multi_screen":
          toast({
            title: ((<span className="text-red-600 dark:text-red-400">{t.antiCheatingBanner.multiScreenTitle}</span>) as unknown as string),
            description: t.antiCheatingBanner.multiScreenBody,
          });
          break;
      }
    },
    [toast, recordDeparture, persistViolation, t],
  );

  useAntiCheating({ enabled, onViolation: handleViolation });

  if (!enabled || !warningOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-900 dark:bg-gray-900">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t.antiCheatingBanner.departureTitle}
          </h2>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t.antiCheatingBanner.departureBody}{" "}
            <span className="font-semibold text-red-600 dark:text-red-400">
              {t.antiCheatingBanner.departureCount(departureCount)}
            </span>
            {t.antiCheatingBanner.departureSuffix}
          </p>

          {departureCount >= 3 && (
            <div className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {t.antiCheatingBanner.departureMaxWarning}
            </div>
          )}

          <button
            onClick={() => setWarningOpen(false)}
            className="mt-5 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {t.antiCheatingBanner.understandContinue}
          </button>
        </div>
      </div>
    </div>
  );
}
