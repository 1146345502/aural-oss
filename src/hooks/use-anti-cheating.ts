"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AntiCheatingViolation {
  type: "page_departure" | "paste" | "multi_screen";
  timestamp: number;
  detail?: string;
}

interface UseAntiCheatingOptions {
  enabled: boolean;
  onViolation?: (violation: AntiCheatingViolation) => void;
}

interface UseAntiCheatingResult {
  violations: AntiCheatingViolation[];
  departureCount: number;
  multiScreenDetected: boolean;
}

export function useAntiCheating({
  enabled,
  onViolation,
}: UseAntiCheatingOptions): UseAntiCheatingResult {
  const [violations, setViolations] = useState<AntiCheatingViolation[]>([]);
  const [departureCount, setDepartureCount] = useState(0);
  const [multiScreenDetected, setMultiScreenDetected] = useState(false);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const addViolation = useCallback((violation: AntiCheatingViolation) => {
    setViolations((prev) => [...prev, violation]);
    onViolationRef.current?.(violation);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const recordDeparture = () => {
      setDepartureCount((prev) => prev + 1);
      addViolation({
        type: "page_departure",
        timestamp: Date.now(),
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = null;
        }
        recordDeparture();
      }
    };

    const handleBlur = () => {
      blurTimer = setTimeout(() => {
        blurTimer = null;
        recordDeparture();
      }, 200);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, addViolation]);

  useEffect(() => {
    if (!enabled) return;

    const internalCopies = new Set<string>();

    const trackText = (text: string | undefined | null) => {
      const trimmed = text?.trim();
      if (trimmed) internalCopies.add(trimmed);
    };

    const getSelectionText = (): string => {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) return sel;
      const el = document.activeElement;
      if (
        (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
        el.selectionStart != null &&
        el.selectionEnd != null
      ) {
        return el.value.substring(el.selectionStart, el.selectionEnd).trim();
      }
      return "";
    };

    const handleCopy = (e: ClipboardEvent) => {
      trackText(getSelectionText());
      trackText(e.clipboardData?.getData("text/plain"));
    };

    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (!pastedText || internalCopies.has(pastedText)) return;
      e.preventDefault();
      e.stopPropagation();
      addViolation({
        type: "paste",
        timestamp: Date.now(),
        detail: "External content pasted",
      });
    };

    // Intercept DataTransfer.setData to catch editors (e.g. Monaco) that
    // write selected text via clipboardData.setData() in their own copy/cut
    // handlers, which run after our capture-phase listener.
    const origSetData = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (format: string, data: string) {
      if (format === "text/plain" || format === "text") trackText(data);
      return origSetData.call(this, format, data);
    };

    // Also intercept Clipboard API writeText for editors that bypass
    // DOM copy events entirely.
    const origWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (origWriteText) {
      navigator.clipboard.writeText = (text: string) => {
        trackText(text);
        return origWriteText(text);
      };
    }

    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("cut", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);

    return () => {
      DataTransfer.prototype.setData = origSetData;
      if (origWriteText) navigator.clipboard.writeText = origWriteText;
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
    };
  }, [enabled, addViolation]);

  useEffect(() => {
    if (!enabled) return;

    const checkScreens = () => {
      if (typeof window === "undefined") return;

      const screen = window.screen as Screen & { availLeft?: number };
      const hasMultiple =
        screen.availWidth > screen.width ||
        (screen.availLeft !== undefined && screen.availLeft !== 0);

      if (hasMultiple && !multiScreenDetected) {
        setMultiScreenDetected(true);
        addViolation({
          type: "multi_screen",
          timestamp: Date.now(),
          detail: `Multiple screens detected (${window.screen.availWidth}x${window.screen.availHeight})`,
        });
      }
    };

    const screenDetails = (window as unknown as { getScreenDetails?: () => Promise<{ screens: unknown[] }> })
      .getScreenDetails;
    if (screenDetails) {
      screenDetails()
        .then((details) => {
          if (details.screens.length > 1) {
            setMultiScreenDetected(true);
            addViolation({
              type: "multi_screen",
              timestamp: Date.now(),
              detail: `${details.screens.length} screens detected via Screen API`,
            });
          }
        })
        .catch(() => {
          checkScreens();
        });
    } else {
      checkScreens();
    }

    const interval = setInterval(checkScreens, 10000);
    return () => clearInterval(interval);
  }, [enabled, multiScreenDetected, addViolation]);

  return { violations, departureCount, multiScreenDetected };
}
