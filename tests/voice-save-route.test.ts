import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMessageBasedDuration,
  computeSegmentDuration,
  handleVoiceSave,
  type ActivitySegment,
} from "@/app/api/voice/save/logic";

// ── computeSegmentDuration unit tests ───────────────────────────────

test("computeSegmentDuration returns 0 for empty segments", () => {
  assert.equal(computeSegmentDuration([], Date.now()), 0);
});

test("computeSegmentDuration sums closed segments", () => {
  const segments: ActivitySegment[] = [
    { enteredAt: "2026-03-11T10:00:00Z", leftAt: "2026-03-11T10:15:00Z" },
    { enteredAt: "2026-03-11T14:00:00Z", leftAt: "2026-03-11T14:20:00Z" },
  ];
  // 15 min + 20 min = 35 min = 2100s
  assert.equal(computeSegmentDuration(segments, Date.now()), 2100);
});

test("computeSegmentDuration uses now for open segment", () => {
  const segments: ActivitySegment[] = [
    { enteredAt: "2026-03-11T10:00:00Z", leftAt: "2026-03-11T10:15:00Z" },
    { enteredAt: "2026-03-11T14:00:00Z", leftAt: null },
  ];
  const now = new Date("2026-03-11T14:20:00Z").getTime();
  // 15 min + 20 min = 2100s
  assert.equal(computeSegmentDuration(segments, now), 2100);
});

test("computeSegmentDuration excludes gap between segments", () => {
  const segments: ActivitySegment[] = [
    { enteredAt: "2026-03-11T10:00:00Z", leftAt: "2026-03-11T10:15:00Z" },
    // 4-hour gap — NOT counted
    { enteredAt: "2026-03-11T14:00:00Z", leftAt: "2026-03-11T14:20:00Z" },
  ];
  // Only 15 + 20 = 35 min = 2100s, NOT 4h35m
  assert.equal(computeSegmentDuration(segments, Date.now()), 2100);
});

// ── computeMessageBasedDuration unit tests ──────────────────────────

test("computeMessageBasedDuration with no messages returns capped start-to-end", () => {
  const start = new Date("2026-03-11T10:00:00Z").getTime();
  const end = new Date("2026-03-11T10:03:00Z").getTime();
  // 3 min = 180s, under the 5-min cap
  assert.equal(computeMessageBasedDuration(start, [], end), 180);
});

test("computeMessageBasedDuration caps each gap at 5 minutes", () => {
  const start = new Date("2026-03-11T10:00:00Z").getTime();
  const end = new Date("2026-03-11T11:00:00Z").getTime();
  const msgTimes = [
    new Date("2026-03-11T10:01:00Z").getTime(),
    new Date("2026-03-11T10:40:00Z").getTime(), // 39-min gap from previous
  ];
  // start->m1: 60s, m1->m2: capped 300s, m2->end: 20min capped 300s = 660s
  assert.equal(computeMessageBasedDuration(start, msgTimes, end), 660);
});

test("computeMessageBasedDuration sums small gaps without capping", () => {
  const start = new Date("2026-03-11T10:00:00Z").getTime();
  const end = new Date("2026-03-11T10:04:00Z").getTime();
  const msgTimes = [
    new Date("2026-03-11T10:01:00Z").getTime(),
    new Date("2026-03-11T10:02:00Z").getTime(),
    new Date("2026-03-11T10:03:00Z").getTime(),
  ];
  // 60 + 60 + 60 + 60 = 240s
  assert.equal(computeMessageBasedDuration(start, msgTimes, end), 240);
});

// ── handleVoiceSave integration tests ───────────────────────────────

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

  const defaultSegments: ActivitySegment[] = [
    { enteredAt: "2026-03-11T10:00:00.000Z", leftAt: null },
  ];

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
          status: "IN_PROGRESS",
          startedAt: "2026-03-11T10:00:00.000Z",
          activitySegments: defaultSegments,
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
      async loadActivitySegments(sessionId: string) {
        void sessionId;
        return defaultSegments;
      },
      async closeOpenSegments(_sessionId: string, nowStr: string) {
        return defaultSegments.map((s) =>
          s.leftAt === null ? { ...s, leftAt: nowStr } : s,
        );
      },
      async loadMessageTimestamps(sessionId: string) {
        void sessionId;
        return [] as string[];
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

test("handleVoiceSave completes session with segment-based duration", async () => {
  const { ops, updatedSessions, summaryCalls, infoLogs } = createOps();

  const result = await handleVoiceSave(
    {
      sessionId: "session-1",
      messages: [
        { role: "user", content: "hello there" },
        { role: "assistant", content: "general kenobi" },
      ],
      complete: true,
    },
    ops,
  );

  assert.equal(result.status, 200);
  assert.equal(updatedSessions.length, 1);
  // Single segment: 10:00 → 10:05 = 300s
  assert.deepEqual(updatedSessions[0].payload, {
    status: "COMPLETED",
    completedAt: "2026-03-11T10:05:00.000Z",
    totalDurationSeconds: 300,
  });
  assert.equal(summaryCalls.length, 1);
  assert.ok(infoLogs.some((m) => m.includes("COMPLETED (300s)")));
});

test("handleVoiceSave skips already-completed sessions", async () => {
  const { ops, updatedSessions, summaryCalls } = createOps();
  const completedOps = {
    ...ops,
    async loadSessionForCompletion(sessionId: string) {
      void sessionId;
      return {
        status: "COMPLETED",
        startedAt: "2026-03-11T10:00:00.000Z",
        activitySegments: [],
        interview: {
          title: "Test", objective: null, language: "en",
          userId: "u1", projectId: "p1",
          assessmentCriteria: null, questions: [],
        },
      };
    },
  };

  const result = await handleVoiceSave(
    { sessionId: "session-done", complete: true },
    completedOps,
  );

  assert.equal(result.status, 200);
  assert.equal(updatedSessions.length, 0);
  assert.equal(summaryCalls.length, 0);
});

test("handleVoiceSave computes duration excluding gap between segments", async () => {
  const { ops, updatedSessions } = createOps();
  const gapSegments: ActivitySegment[] = [
    { enteredAt: "2026-03-11T10:00:00Z", leftAt: "2026-03-11T10:15:00Z" },
    { enteredAt: "2026-03-11T14:00:00Z", leftAt: null },
  ];
  const gapOps = {
    ...ops,
    async loadSessionForCompletion(sessionId: string) {
      void sessionId;
      return {
        status: "IN_PROGRESS",
        startedAt: "2026-03-11T10:00:00.000Z",
        activitySegments: gapSegments,
        interview: {
          title: "Test", objective: null, language: "en",
          userId: "u1", projectId: "p1",
          assessmentCriteria: null, questions: [],
        },
      };
    },
    async closeOpenSegments(_sessionId: string, nowStr: string) {
      return gapSegments.map((s) =>
        s.leftAt === null ? { ...s, leftAt: nowStr } : s,
      );
    },
    now: () => new Date("2026-03-11T14:20:00.000Z"),
  };

  const result = await handleVoiceSave(
    { sessionId: "session-gap", complete: true },
    gapOps,
  );

  assert.equal(result.status, 200);
  assert.equal(updatedSessions.length, 1);
  // 15min + 20min = 2100s, gap excluded
  assert.equal(updatedSessions[0].payload.totalDurationSeconds, 2100);
});

test("handleVoiceSave falls back to message-based duration when segments are empty", async () => {
  const { ops, updatedSessions } = createOps();
  const fallbackOps = {
    ...ops,
    async loadSessionForCompletion(sessionId: string) {
      void sessionId;
      return {
        status: "IN_PROGRESS",
        startedAt: "2026-03-11T10:00:00.000Z",
        activitySegments: [],
        interview: {
          title: "Test", objective: null, language: "en",
          userId: "u1", projectId: "p1",
          assessmentCriteria: null, questions: [],
        },
      };
    },
    async closeOpenSegments() {
      return [];
    },
    async loadMessageTimestamps(sessionId: string) {
      void sessionId;
      return [
        "2026-03-11T10:01:00.000Z",
        "2026-03-11T10:02:00.000Z",
        "2026-03-11T10:03:00.000Z",
      ];
    },
  };

  const result = await handleVoiceSave(
    { sessionId: "session-no-segments", complete: true },
    fallbackOps,
  );

  assert.equal(result.status, 200);
  assert.equal(updatedSessions.length, 1);
  // start(10:00) -> m1(10:01, 60s) -> m2(10:02, 60s) -> m3(10:03, 60s) -> end(10:05, 120s) = 300s
  assert.equal(updatedSessions[0].payload.totalDurationSeconds, 300);
});

test("message-based fallback caps idle gaps at 5 minutes", async () => {
  const { ops, updatedSessions } = createOps();
  const fallbackOps = {
    ...ops,
    async loadSessionForCompletion(sessionId: string) {
      void sessionId;
      return {
        status: "IN_PROGRESS",
        startedAt: "2026-03-11T10:00:00.000Z",
        activitySegments: [],
        interview: {
          title: "Test", objective: null, language: "en",
          userId: "u1", projectId: "p1",
          assessmentCriteria: null, questions: [],
        },
      };
    },
    async closeOpenSegments() {
      return [];
    },
    async loadMessageTimestamps(sessionId: string) {
      void sessionId;
      return [
        "2026-03-11T10:01:00.000Z",  // 60s from start
        "2026-03-11T10:30:00.000Z",  // 29min gap -> capped to 300s
      ];
    },
  };

  const result = await handleVoiceSave(
    { sessionId: "session-idle-gap", complete: true },
    fallbackOps,
  );

  assert.equal(result.status, 200);
  assert.equal(updatedSessions.length, 1);
  // start(10:00) -> m1(10:01, 60s) -> m2(10:30, capped 300s) -> end(10:05... wait, end is now=10:05)
  // Sorted: 10:00, 10:01, 10:05, 10:30 -> 60s + 240s + capped(25min=300s) = 600s
  // Actually the sort order is: start=10:00, m1=10:01, m2=10:30, end=10:05
  // After sort: 10:00, 10:01, 10:05, 10:30
  // Gaps: 60s + 240s + 300s(capped from 25min) = 600s
  assert.equal(updatedSessions[0].payload.totalDurationSeconds, 600);
});

test("handleVoiceSave saves question progress", async () => {
  const { ops, updatedSessions, infoLogs } = createOps();
  const result = await handleVoiceSave(
    { sessionId: "session-2", currentQuestionIndex: 1 },
    ops,
  );
  assert.equal(result.status, 200);
  assert.deepEqual(updatedSessions, [{
    sessionId: "session-2",
    payload: { currentQuestionId: "q-2", lastActivityAt: "2026-03-11T10:05:00.000Z" },
  }]);
  assert.ok(infoLogs.some((m) => m.includes("Progress saved")));
});

test("handleVoiceSave records heartbeat", async () => {
  const { ops, updatedSessions, infoLogs } = createOps();
  const result = await handleVoiceSave({ sessionId: "session-3" }, ops);
  assert.equal(result.status, 200);
  assert.deepEqual(updatedSessions, [{
    sessionId: "session-3",
    payload: { lastActivityAt: "2026-03-11T10:05:00.000Z" },
  }]);
  assert.ok(infoLogs.some((m) => m.includes("Heartbeat")));
});

test("handleVoiceSave surfaces storage failures", async () => {
  const { ops, errorLogs } = createOps();
  const failingOps = {
    ...ops,
    async updateSession() { throw new Error("db down"); },
  };
  const result = await handleVoiceSave({ sessionId: "s4" }, failingOps);
  assert.equal(result.status, 500);
  assert.ok(errorLogs.some((a) => a[1] instanceof Error && a[1].message === "db down"));
});
