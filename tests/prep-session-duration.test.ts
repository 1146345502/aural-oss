import assert from "node:assert/strict";
import test from "node:test";
import { effectiveNowForSession } from "../src/app/api/voice/save/logic";
import { effectivePrepDurationSeconds } from "../src/lib/prep/session-duration";

test("effectivePrepDurationSeconds returns stored total for completed sessions", () => {
  const seconds = effectivePrepDurationSeconds(
    {
      startedAt: "2026-05-23T08:00:00.000Z",
      lastActivityAt: "2026-05-23T08:05:00.000Z",
      status: "COMPLETED",
      totalDurationSeconds: 240,
    },
    Date.parse("2026-05-24T01:00:00.000Z"),
  );
  assert.equal(seconds, 240);
});

test("effectivePrepDurationSeconds caps idle IN_PROGRESS duration at last activity", () => {
  const startedAt = "2026-05-23T08:00:00.000Z";
  const lastActivityAt = "2026-05-23T08:06:00.000Z";
  const nowMs = Date.parse("2026-05-24T01:00:00.000Z");
  const cappedNowMs = effectiveNowForSession(lastActivityAt, nowMs);

  const seconds = effectivePrepDurationSeconds(
    {
      startedAt,
      lastActivityAt,
      status: "IN_PROGRESS",
      totalDurationSeconds: null,
    },
    nowMs,
  );

  assert.equal(
    seconds,
    Math.max(0, Math.round((cappedNowMs - Date.parse(startedAt)) / 1000)),
  );
  assert.ok(seconds !== null && seconds < 3600);
});

test("effectivePrepDurationSeconds grows while the session is still active", () => {
  const startedAt = "2026-05-23T08:00:00.000Z";
  const nowMs = Date.parse("2026-05-23T08:03:00.000Z");

  const seconds = effectivePrepDurationSeconds(
    {
      startedAt,
      lastActivityAt: new Date(nowMs).toISOString(),
      status: "IN_PROGRESS",
      totalDurationSeconds: null,
    },
    nowMs,
  );

  assert.equal(seconds, 180);
});
