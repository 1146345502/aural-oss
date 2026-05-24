import { effectiveNowForSession } from "@/app/api/voice/save/logic";

type PrepSessionTiming = {
  startedAt: string;
  lastActivityAt: string;
  status: string;
  totalDurationSeconds: number | null;
};

/** Effective elapsed seconds for a practice session (caps idle IN_PROGRESS time). */
export function effectivePrepDurationSeconds(
  session: PrepSessionTiming,
  nowMs = Date.now(),
): number | null {
  if (session.totalDurationSeconds !== null) {
    return session.totalDurationSeconds;
  }
  if (session.status !== "IN_PROGRESS") return null;

  const startedMs = new Date(session.startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;

  const cappedNowMs = effectiveNowForSession(session.lastActivityAt, nowMs);
  return Math.max(0, Math.round((cappedNowMs - startedMs) / 1000));
}
