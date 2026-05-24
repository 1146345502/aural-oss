import assert from "node:assert/strict";
import test from "node:test";

import { computeMediaRetention } from "../src/lib/media-retention";
import { prepAnswerAudioStoragePath } from "../src/lib/prep/answer-audio";

test("prepAnswerAudioStoragePath uses prep prefix and attempt id", () => {
  assert.equal(
    prepAnswerAudioStoragePath("session-1", "attempt-1", "audio/webm"),
    "prep/session-1/attempt-1.webm",
  );
  assert.equal(
    prepAnswerAudioStoragePath("session-1", "attempt-1", "audio/mp4"),
    "prep/session-1/attempt-1.m4a",
  );
});

test("computeMediaRetention reports the configured window without expiring OSS media", () => {
  const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const retention = computeMediaRetention(createdAt, "Self-hosted", true);

  assert.equal(retention.retentionDays, 7);
  assert.equal(retention.expiresSoon, false);
  assert.equal(retention.expired, false);
  assert.ok(retention.daysRemaining > 0);
});

test("computeMediaRetention does not expire old media in OSS builds", () => {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const retention = computeMediaRetention(createdAt, "Self-hosted", true);

  assert.equal(retention.expiresSoon, false);
  assert.equal(retention.expired, false);
});
