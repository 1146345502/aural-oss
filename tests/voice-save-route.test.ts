import assert from "node:assert/strict";
import test from "node:test";

import { handleVoiceSave } from "@/app/api/voice/save/logic";

function createOps() {
  const insertedMessages: unknown[][] = [];
  const updatedSessions: Array<{
    sessionId: string;
    payload: Record<string, unknown>;
  }> = [];
  const infoLogs: string[] = [];
  const errorLogs: unknown[][] = [];
  const summaryCalls: unknown[][] = [];

  const now = new Date("2026-03-11T10:05:00.000Z");

  return {
    insertedMessages,
    updatedSessions,
    infoLogs,
    errorLogs,
    summaryCalls,
    ops: {
      async insertMessages(
        sessionId: string,
        messages: NonNullable<Parameters<typeof handleVoiceSave>[0]["messages"]>,
      ) {
        void sessionId;
        insertedMessages.push(
          messages.map((m) => ({
            role: m.role === "user" ? "USER" : "ASSISTANT",
            content: m.content,
            contentType: "TEXT",
            questionId: m.questionId || null,
            wordCount: m.content.split(/\s+/).length,
            transcription: m.source === "chat" ? "chat" : null,
          })),
        );
      },
      async loadSessionForCompletion(sessionId: string) {
        void sessionId;
        return {
          startedAt: "2026-03-11T10:00:00.000Z",
          interview: {
            title: "System Design Interview",
            objective: "Assess architecture skill",
            language: "en",
            userId: "user-1",
            projectId: "project-1",
            assessmentCriteria: [{ name: "Depth", description: "Technical depth" }],
            questions: [{ text: "Describe your system.", order: 0, type: "OPEN_ENDED" }],
          },
        };
      },
      async loadFirstMessageTimestamp(sessionId: string) {
        void sessionId;
        return "2026-03-11T10:01:00.000Z";
      },
      async loadSessionForProgress(sessionId: string) {
        void sessionId;
        return {
          interview: {
            questions: [{ id: "q-1" }, { id: "q-2" }, { id: "q-3" }],
          },
        };
      },
      async updateSession(sessionId: string, payload: Record<string, unknown>) {
        updatedSessions.push({ sessionId, payload });
      },
      async generateSummary(...args: unknown[]) {
        summaryCalls.push(args);
      },
      log: {
        info(message: string) {
          infoLogs.push(message);
        },
        error(...args: unknown[]) {
          errorLogs.push(args);
        },
      },
      now: () => now,
    },
  };
}

test("handleVoiceSave rejects missing session ids", async () => {
  const { ops, updatedSessions, insertedMessages } = createOps();

  const result = await handleVoiceSave({}, ops);

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Missing sessionId" });
  assert.equal(updatedSessions.length, 0);
  assert.equal(insertedMessages.length, 0);
});

test("handleVoiceSave inserts mapped text messages before updating completion state", async () => {
  const { ops, insertedMessages, updatedSessions, summaryCalls, infoLogs } =
    createOps();

  const result = await handleVoiceSave(
    {
      sessionId: "session-1",
      messages: [
        { role: "user", content: "hello there", source: "chat", questionId: "q-1" },
        { role: "assistant", content: "general kenobi" },
      ],
      complete: true,
    },
    ops,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(insertedMessages, [
    [
      {
        role: "USER",
        content: "hello there",
        contentType: "TEXT",
        questionId: "q-1",
        wordCount: 2,
        transcription: "chat",
      },
      {
        role: "ASSISTANT",
        content: "general kenobi",
        contentType: "TEXT",
        questionId: null,
        wordCount: 2,
        transcription: null,
      },
    ],
  ]);
  assert.equal(updatedSessions.length, 1);
  assert.deepEqual(updatedSessions[0], {
    sessionId: "session-1",
    payload: {
      status: "COMPLETED",
      completedAt: "2026-03-11T10:05:00.000Z",
      startedAt: "2026-03-11T10:01:00.000Z",
      totalDurationSeconds: 240,
    },
  });
  assert.equal(summaryCalls.length, 1);
  assert.deepEqual(summaryCalls[0], [
    "session-1",
    "System Design Interview",
    "Assess architecture skill",
    "en",
    [{ text: "Describe your system.", order: 0, type: "OPEN_ENDED" }],
    [{ name: "Depth", description: "Technical depth" }],
  ]);
  assert.ok(
    infoLogs.some((message) =>
      message.includes("Session session-1 marked COMPLETED (240s)"),
    ),
  );
});

test("handleVoiceSave saves current question progress using the indexed question id", async () => {
  const { ops, updatedSessions, infoLogs } = createOps();

  const result = await handleVoiceSave(
    {
      sessionId: "session-2",
      currentQuestionIndex: 1,
    },
    ops,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(updatedSessions, [
    {
      sessionId: "session-2",
      payload: {
        currentQuestionId: "q-2",
        lastActivityAt: "2026-03-11T10:05:00.000Z",
      },
    },
  ]);
  assert.ok(
    infoLogs.some((message) =>
      message.includes("Progress saved for session session-2 at question 2"),
    ),
  );
});

test("handleVoiceSave records heartbeat updates when no completion or progress payload is present", async () => {
  const { ops, updatedSessions, infoLogs } = createOps();

  const result = await handleVoiceSave(
    {
      sessionId: "session-3",
    },
    ops,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(updatedSessions, [
    {
      sessionId: "session-3",
      payload: {
        lastActivityAt: "2026-03-11T10:05:00.000Z",
      },
    },
  ]);
  assert.ok(
    infoLogs.some((message) => message.includes("Heartbeat saved for session session-3")),
  );
});

test("handleVoiceSave surfaces storage failures without crashing the route", async () => {
  const { ops, errorLogs } = createOps();

  const failingOps = {
    ...ops,
    async updateSession() {
      throw new Error("db down");
    },
  };

  const result = await handleVoiceSave(
    {
      sessionId: "session-4",
    },
    failingOps,
  );

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Failed to save voice data" });
  assert.ok(
    errorLogs.some(
      (args) =>
        args[0] === "Voice save error:" &&
        args[1] instanceof Error &&
        args[1].message === "db down",
    ),
  );
});
