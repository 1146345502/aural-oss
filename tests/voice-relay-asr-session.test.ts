import assert from "node:assert/strict";
import test from "node:test";

import {
    asrPendingFinalDelayMs,
    createAsrSessionState,
    deriveAsrSessionUpdate,
    markAsrSessionCommitted,
    resetAsrSessionState,
    type AsrResultPacket,
} from "../server/voice-relay-helpers";

/**
 * Volcengine runs with `result_type: "full"`, so a packet carries the whole session transcript:
 * every endpointed segment plus the one in progress. These helpers build packets the same way.
 */
function packet(
  segments: { text: string; definite: boolean }[],
): AsrResultPacket {
  return {
    text: segments.map((s) => s.text).join(" "),
    utterances: segments,
  };
}

test("a settled segment repeated on every audio packet is reported once", () => {
  const state = createAsrSessionState();
  const settled = packet([{ text: "I don't know.", definite: true }]);

  const first = deriveAsrSessionUpdate(state, settled);
  assert.equal(first.text, "I don't know.");
  assert.equal(first.definite, true);
  assert.equal(first.changed, true);

  // The recorded incident had eight of these arriving at the audio packet cadence.
  for (let i = 0; i < 8; i++) {
    const repeat = deriveAsrSessionUpdate(state, settled);
    assert.equal(repeat.changed, false, `repeat ${i + 1} should say nothing new`);
  }
});

test("speech resuming after a short pause extends the same turn", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([{ text: "I don't know.", definite: true }]));

  // The pause endpointed segment one; segment two starts while segment one keeps being resent.
  const resumed = deriveAsrSessionUpdate(state, packet([
    { text: "I don't know.", definite: true },
    { text: "你看这", definite: false },
  ]));

  assert.equal(resumed.text, "I don't know. 你看这");
  assert.equal(resumed.definite, false, "the newest segment is still open");
  assert.equal(resumed.changed, true);

  const finished = deriveAsrSessionUpdate(state, packet([
    { text: "I don't know.", definite: true },
    { text: "你看这个问题。", definite: true },
  ]));

  assert.equal(finished.text, "I don't know. 你看这个问题。");
  assert.equal(finished.definite, true);
});

test("a segment that goes definite without changing text is still reported", () => {
  const state = createAsrSessionState();

  const interim = deriveAsrSessionUpdate(state, packet([{ text: "Yes, that's right.", definite: false }]));
  assert.equal(interim.changed, true);
  assert.equal(interim.definite, false);

  const settled = deriveAsrSessionUpdate(state, packet([{ text: "Yes, that's right.", definite: true }]));
  assert.equal(settled.text, "Yes, that's right.");
  assert.equal(settled.definite, true);
  assert.equal(settled.changed, true, "endpointing is news even when the words are identical");
});

/**
 * `definite` flipping back to false with the wording unchanged is what the relay's coalesce timer
 * keys off. It must be reported as a change (so endpointing state stays in sync) while still being
 * distinguishable from actual new speech, which the relay checks by comparing the text itself.
 */
test("endpointing that reverts with unchanged wording is not new speech", () => {
  const state = createAsrSessionState();

  const settled = deriveAsrSessionUpdate(state, packet([{ text: "roles at Uber and", definite: true }]));
  assert.equal(settled.definite, true);

  const reopened = deriveAsrSessionUpdate(state, {
    text: "roles at Uber and",
    utterances: [
      { text: "roles at Uber and", definite: false },
      { text: "", definite: false },
    ],
  });

  assert.equal(reopened.definite, false, "the provider reopened the segment");
  assert.equal(reopened.changed, true, "the endpointing state changed");
  assert.equal(reopened.text, settled.text, "but no new words arrived");
});

test("committing a turn means later packets only carry new speech", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([{ text: "First answer.", definite: true }]));
  markAsrSessionCommitted(state);

  const replay = deriveAsrSessionUpdate(state, packet([{ text: "First answer.", definite: true }]));
  assert.equal(replay.text, "", "committed speech must not be handed over twice");
  assert.equal(replay.changed, false);

  const continued = deriveAsrSessionUpdate(state, packet([
    { text: "First answer.", definite: true },
    { text: "Second answer.", definite: true },
  ]));
  assert.equal(continued.text, "Second answer.");
  assert.equal(continued.definite, true);
  assert.equal(continued.changed, true);
});

test("a committed turn is not handed back when the provider trims or repeats it", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([
    { text: "We migrated the whole billing pipeline to Kafka last year.", definite: true },
  ]));
  markAsrSessionCommitted(state);

  const shortened = deriveAsrSessionUpdate(state, packet([
    { text: "We migrated the whole billing pipeline to Kafka last", definite: true },
  ]));
  assert.equal(shortened.text, "", "a narrower view of committed speech is not new speech");
});

test("a commit landing mid-segment still yields the rest of that segment", () => {
  const state = createAsrSessionState();

  // The active-speech guard force-commits long answers while the segment is still open.
  deriveAsrSessionUpdate(state, packet([
    { text: "So the first thing we did was", definite: false },
  ]));
  markAsrSessionCommitted(state);

  const rest = deriveAsrSessionUpdate(state, packet([
    { text: "So the first thing we did was profile the hot path.", definite: true },
  ]));
  assert.equal(rest.text, "profile the hot path.");
  assert.equal(rest.definite, true);
});

test("new speech survives a second-pass rewording of the committed prefix", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([
    { text: "We migrated the whole billing pipeline to Kafka last year.", definite: true },
  ]));
  markAsrSessionCommitted(state);

  const extended = deriveAsrSessionUpdate(state, packet([
    { text: "We migrated the entire billing pipeline to Kafka last year.", definite: true },
    { text: "It took two quarters.", definite: true },
  ]));

  assert.ok(
    extended.text.includes("It took two quarters."),
    `expected the new sentence to survive, got: "${extended.text}"`,
  );
  assert.ok(
    !extended.text.includes("Kafka last year. We migrated"),
    `expected no duplicated prefix, got: "${extended.text}"`,
  );
});

test("endpointing falls back to the last-package flag when segments are absent", () => {
  const state = createAsrSessionState();

  const interim = deriveAsrSessionUpdate(state, { text: "Hello there" });
  assert.equal(interim.text, "Hello there");
  assert.equal(interim.definite, false);

  const last = deriveAsrSessionUpdate(state, { text: "Hello there again", isLastPackage: true });
  assert.equal(last.text, "Hello there again");
  assert.equal(last.definite, true);
});

test("segment text carries the transcript when the provider omits the full text", () => {
  const state = createAsrSessionState();

  const update = deriveAsrSessionUpdate(state, {
    utterances: [
      { text: "这是字节跳动，", definite: true },
      { text: "今日头条母公司。", definite: true },
    ],
  });

  assert.equal(update.text, "这是字节跳动， 今日头条母公司。");
  assert.equal(update.definite, true);
});

test("empty packets keep the pending transcript intact", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([{ text: "Still talking", definite: false }]));
  const idle = deriveAsrSessionUpdate(state, { utterances: [] });

  assert.equal(idle.changed, false);
  assert.equal(state.sessionText, "Still talking", "an empty packet must not erase the session");
});

/**
 * The provider opens the next utterance in the same packet that endpoints the previous one, so the
 * literal last array element is an empty in-progress segment. Reading endpointing from it reports
 * `definite: false` for the rest of the session, which leaves the turn uncommitted until the
 * client's stale-transcript watchdog fires ~12s later.
 */
test("a trailing empty segment does not mask endpointing of the spoken segment", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([{ text: "Sure, my name is Qingyuan", definite: false }]));

  const endpointed = deriveAsrSessionUpdate(state, {
    text: "Sure, my name is Qingyuan.",
    utterances: [
      { text: "Sure, my name is Qingyuan.", definite: true },
      { text: "", definite: false },
    ],
  });

  assert.equal(endpointed.definite, true, "the spoken segment settled, so the turn must commit");
  assert.equal(endpointed.changed, true, "endpointing is news even when the wording is unchanged");
  assert.equal(endpointed.text, "Sure, my name is Qingyuan.");
});

test("a trailing segment with words keeps the turn open", () => {
  const state = createAsrSessionState();

  const update = deriveAsrSessionUpdate(state, packet([
    { text: "First part.", definite: true },
    { text: "and I am still going", definite: false },
  ]));

  assert.equal(update.definite, false, "the newest spoken segment is still in progress");
});

test("whitespace-only trailing segments are treated as empty", () => {
  const state = createAsrSessionState();

  const update = deriveAsrSessionUpdate(state, {
    text: "All done.",
    utterances: [
      { text: "All done.", definite: true },
      { text: "   ", definite: false },
    ],
  });

  assert.equal(update.definite, true);
});

test("reconnecting clears the session so the new websocket starts from scratch", () => {
  const state = createAsrSessionState();

  deriveAsrSessionUpdate(state, packet([{ text: "Before the rotation.", definite: true }]));
  markAsrSessionCommitted(state);
  resetAsrSessionState(state);

  const afterRotation = deriveAsrSessionUpdate(state, packet([
    { text: "After the rotation.", definite: false },
  ]));
  assert.equal(afterRotation.text, "After the rotation.");
  assert.equal(afterRotation.changed, true);
});

/** Relay defaults at the time of writing. */
const LONG_COALESCE_MS = 3_000;
const QUIET_FLOOR_MS = 800;

test("pause tolerance does not shrink as a long answer goes on", () => {
  // The recorded regression: a multi-part answer had been running for 4.4s when the speaker paused
  // ~800ms mid-list. Budgeting from the turn's start left only the quiet floor, so the turn was
  // committed and the rest of the sentence came back as a barge-in.
  const midListPause = asrPendingFinalDelayMs({
    coalesceTargetMs: LONG_COALESCE_MS,
    quietFloorMs: QUIET_FLOOR_MS,
    quietElapsedMs: 800,
  });

  assert.equal(midListPause, 2_200, "still 2.2s of room left, so the turn stays open");

  // Same pause, whether it is the speaker's first breath or their tenth.
  for (const quietElapsedMs of [0, 500, 800, 1_500]) {
    assert.equal(
      asrPendingFinalDelayMs({
        coalesceTargetMs: LONG_COALESCE_MS,
        quietFloorMs: QUIET_FLOOR_MS,
        quietElapsedMs,
      }),
      LONG_COALESCE_MS - quietElapsedMs,
      `delay must depend only on the quiet gap (${quietElapsedMs}ms)`,
    );
  }
});

test("a settled transcript commits once the coalesce window is spent", () => {
  assert.equal(
    asrPendingFinalDelayMs({
      coalesceTargetMs: LONG_COALESCE_MS,
      quietFloorMs: QUIET_FLOOR_MS,
      quietElapsedMs: LONG_COALESCE_MS,
    }),
    0,
  );
  assert.equal(
    asrPendingFinalDelayMs({
      coalesceTargetMs: LONG_COALESCE_MS,
      quietFloorMs: QUIET_FLOOR_MS,
      quietElapsedMs: 99_999,
    }),
    0,
    "never negative",
  );
});

test("the quiet floor keeps very short answers from committing instantly", () => {
  // "Yes." classifies as short (300ms), but the floor still applies.
  assert.equal(
    asrPendingFinalDelayMs({
      coalesceTargetMs: 300,
      quietFloorMs: QUIET_FLOOR_MS,
      quietElapsedMs: 0,
    }),
    QUIET_FLOOR_MS,
  );
});
