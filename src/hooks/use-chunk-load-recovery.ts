"use client";

import { useEffect } from "react";

const CHUNK_RECOVERY_KEY = "aural:chunk-load-recovery-at";
const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

function getErrorText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name} ${value.message} ${value.stack ?? ""}`;
  }
  if (typeof value === "object") {
    const maybeMessage = "message" in value ? String(value.message) : "";
    const maybeStack = "stack" in value ? String(value.stack) : "";
    return `${maybeMessage} ${maybeStack}`;
  }
  return String(value);
}

function isRecoverableChunkLoadError(value: unknown): boolean {
  const text = getErrorText(value);
  return (
    text.includes("ChunkLoadError") ||
    text.includes("Loading chunk") ||
    text.includes("/_next/static/chunks/") ||
    (text.includes("MIME type") && text.includes("text/html")) ||
    text.includes("ERR_ABORTED 404")
  );
}

function reloadOnceForFreshChunks() {
  const now = Date.now();
  const lastAttempt = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
  if (Number.isFinite(lastAttempt) && now - lastAttempt < CHUNK_RECOVERY_COOLDOWN_MS) {
    return;
  }

  window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  window.location.reload();
}

export function useChunkLoadRecovery() {
  useEffect(() => {
    const handleError = (event: ErrorEvent | Event) => {
      const target = event.target;
      const resourceUrl =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement
            ? target.href
            : "";
      const errorDetails =
        event instanceof ErrorEvent
          ? event.error || event.message || event.filename
          : resourceUrl;

      if (isRecoverableChunkLoadError(errorDetails) || resourceUrl.includes("/_next/static/")) {
        reloadOnceForFreshChunks();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isRecoverableChunkLoadError(event.reason)) {
        reloadOnceForFreshChunks();
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);
}

export function useSessionToolChunkPrefetch(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void Promise.all([
      import("@monaco-editor/react"),
      import("@excalidraw/excalidraw"),
    ]).catch((error) => {
      if (!cancelled && isRecoverableChunkLoadError(error)) {
        reloadOnceForFreshChunks();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
