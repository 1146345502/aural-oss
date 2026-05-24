"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 60_000;

function notifyPrepLeave(sessionId: string) {
  const payload = JSON.stringify({ sessionId });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/prep/leave",
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/prep/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Records when the user leaves an active practice session so duration stops
 * accumulating, and keeps lastActivityAt fresh while they remain on the page.
 */
export function usePrepSessionLeave(
  sessionId: string | null,
  active: boolean,
) {
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!sessionId || !active) return;

    const handlePageLeave = () => {
      notifyPrepLeave(sessionId);
    };

    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("pagehide", handlePageLeave);

    const heartbeat = window.setInterval(() => {
      notifyPrepLeave(sessionId);
    }, HEARTBEAT_MS);

    return () => {
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("pagehide", handlePageLeave);
      window.clearInterval(heartbeat);
      notifyPrepLeave(sessionId);
    };
  }, [sessionId, active]);
}
