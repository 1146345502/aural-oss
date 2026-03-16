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

export type CompletionSession = {
  startedAt: string;
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
  loadFirstMessageTimestamp: (sessionId: string) => Promise<string | null>;
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

      if (session) {
        const firstMessageTimestamp =
          await ops.loadFirstMessageTimestamp(sessionId);

        const actualStart = firstMessageTimestamp
          ? new Date(firstMessageTimestamp).getTime()
          : new Date(session.startedAt).getTime();
        const now = ops.now();
        const duration = Math.round((now.getTime() - actualStart) / 1000);

        await ops.updateSession(sessionId, {
          status: "COMPLETED" as const,
          completedAt: now.toISOString(),
          startedAt: new Date(actualStart).toISOString(),
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
