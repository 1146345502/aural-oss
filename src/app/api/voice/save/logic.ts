export type VoiceSavePayload = {
  sessionId?: string;
  messages?: Array<{
    role: string;
    content: string;
    questionId?: string;
    source?: string;
  }>;
  complete?: boolean;
  currentQuestionIndex?: number;
};

export type ActivitySegment = { enteredAt: string; leftAt: string | null };

const ACTIVITY_GAP_CAP_MS = 5 * 60 * 1000;
const STALE_SESSION_GRACE_MS = 10 * 60 * 1000;

/**
 * For IN_PROGRESS sessions, caps the effective "now" so that abandoned
 * sessions don't accumulate unbounded duration. If the session's last
 * activity was more than STALE_SESSION_GRACE_MS ago, we treat the session
 * as having ended shortly after that last activity.
 */
export function effectiveNowForSession(
  lastActivityAt: string | null | undefined,
  nowMs: number,
): number {
  if (!lastActivityAt) return nowMs;
  const lastMs = new Date(lastActivityAt).getTime();
  if (Number.isNaN(lastMs)) return nowMs;
  return Math.min(nowMs, lastMs + STALE_SESSION_GRACE_MS);
}

export function computeSegmentDuration(
  segments: ActivitySegment[],
  nowMs: number,
): number {
  let totalMs = 0;
  for (const seg of segments) {
    const start = new Date(seg.enteredAt).getTime();
    const end = seg.leftAt ? new Date(seg.leftAt).getTime() : nowMs;
    if (end > start) totalMs += end - start;
  }
  return Math.round(totalMs / 1000);
}

/**
 * Fallback for pre-migration sessions without activity segments.
 * Sums gaps between consecutive message timestamps, capping each gap
 * at 5 minutes to exclude idle periods.
 */
export function computeMessageBasedDuration(
  sessionStartMs: number,
  messageTimestamps: number[],
  endMs: number,
): number {
  const points = [sessionStartMs, ...messageTimestamps, endMs].sort(
    (a, b) => a - b,
  );
  let totalMs = 0;
  for (let i = 1; i < points.length; i++) {
    totalMs += Math.min(points[i] - points[i - 1], ACTIVITY_GAP_CAP_MS);
  }
  return Math.round(totalMs / 1000);
}

export type CompletionSession = {
  status: string;
  startedAt: string;
  lastActivityAt?: string | null;
  activitySegments: unknown;
  interview: {
    title: string;
    objective: string | null;
    language: string;
    userId: string;
    projectId: string;
    assessmentCriteria: { name: string; description: string }[] | null;
    questions: { text: string; order: number; type?: string }[];
  };
};

export type ProgressSession = {
  interview: {
    questions: { id: string }[];
  };
};

export type VoiceSaveOps = {
  insertMessages: (
    sessionId: string,
    messages: NonNullable<VoiceSavePayload["messages"]>,
  ) => Promise<void>;
  loadSessionForCompletion: (
    sessionId: string,
  ) => Promise<CompletionSession | null>;
  loadActivitySegments: (sessionId: string) => Promise<ActivitySegment[]>;
  closeOpenSegments: (
    sessionId: string,
    now: string,
  ) => Promise<ActivitySegment[]>;
  loadMessageTimestamps: (sessionId: string) => Promise<string[]>;
  loadSessionForProgress: (sessionId: string) => Promise<ProgressSession | null>;
  updateSession: (
    sessionId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  generateSummary: (
    sessionId: string,
    interviewTitle: string,
    objective?: string | null,
    language?: string | null,
    questions?: { text: string; order: number; type?: string }[] | null,
    assessmentCriteria?: { name: string; description: string }[] | null,
    ownerUserId?: string,
    projectId?: string,
  ) => Promise<void>;
  log: {
    info: (message: string) => void;
    error: (...args: unknown[]) => void;
  };
  now: () => Date;
};

export async function handleVoiceSave(
  payload: VoiceSavePayload,
  ops: VoiceSaveOps,
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const { sessionId, messages, complete, currentQuestionIndex } = payload;

  if (!sessionId) {
    return { status: 400, body: { error: "Missing sessionId" } };
  }

  try {
    if (messages && Array.isArray(messages) && messages.length > 0) {
      await ops.insertMessages(sessionId, messages);
    }

    if (complete) {
      const session = await ops.loadSessionForCompletion(sessionId);

      if (session && session.status !== "COMPLETED") {
        const now = ops.now();
        const cappedNowMs = effectiveNowForSession(session.lastActivityAt, now.getTime());
        const cappedNow = new Date(cappedNowMs).toISOString();
        const segments = await ops.closeOpenSegments(sessionId, cappedNow);
        let duration: number;
        if (segments.length > 0) {
          duration = computeSegmentDuration(segments, cappedNowMs);
        } else {
          const timestamps = await ops.loadMessageTimestamps(sessionId);
          const msgTimesMs = timestamps.map((t) => new Date(t).getTime());
          duration = computeMessageBasedDuration(
            new Date(session.startedAt).getTime(),
            msgTimesMs,
            cappedNowMs,
          );
        }

        await ops.updateSession(sessionId, {
          status: "COMPLETED" as const,
          completedAt: now.toISOString(),
          totalDurationSeconds: duration,
        });

        ops.log.info(`Session ${sessionId} marked COMPLETED (${duration}s)`);

        const interview = session.interview;
        ops
          .generateSummary(
            sessionId,
            interview.title,
            interview.objective,
            interview.language,
            interview.questions,
            interview.assessmentCriteria,
            interview.userId,
            interview.projectId,
          )
          .catch((err) => {
            ops.log.error("Background summary generation failed:", err);
          });
      }
    } else if (typeof currentQuestionIndex === "number") {
      const session = await ops.loadSessionForProgress(sessionId);

      if (session) {
        const questions = session.interview?.questions ?? [];
        const question = questions[currentQuestionIndex];
        await ops.updateSession(sessionId, {
          ...(question ? { currentQuestionId: question.id } : {}),
          lastActivityAt: ops.now().toISOString(),
        });

        ops.log.info(
          `Progress saved for session ${sessionId} at question ${currentQuestionIndex + 1}`,
        );
      }
    } else {
      await ops.updateSession(sessionId, {
        lastActivityAt: ops.now().toISOString(),
      });

      ops.log.info(`Heartbeat saved for session ${sessionId}`);
    }

    return { status: 200, body: { ok: true } };
  } catch (error) {
    ops.log.error("Voice save error:", error);
    return { status: 500, body: { error: "Failed to save voice data" } };
  }
}
