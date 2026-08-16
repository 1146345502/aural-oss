import assert from "node:assert/strict";
import test from "node:test";

import {
    buildSessionResumeState,
    type ResumeMessage,
} from "../src/lib/session-resume";

const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

function message(partial: Partial<ResumeMessage> & Pick<ResumeMessage, "id">): ResumeMessage {
  return {
    id: partial.id,
    role: partial.role ?? "USER",
    content: partial.content ?? "Some answer.",
    contentType: partial.contentType ?? "TEXT",
    whiteboardData: partial.whiteboardData,
    timestamp: partial.timestamp ?? "2026-07-26T10:00:00.000Z",
  };
}

test("a session with no messages is not a resume", () => {
  assert.equal(buildSessionResumeState({ questions }).isResuming, false);
  assert.equal(buildSessionResumeState({ messages: null, questions }).isResuming, false);
  assert.equal(buildSessionResumeState({ messages: [], questions }).isResuming, false);
});

test("stored turns come back as both voice and chat transcripts", () => {
  const resume = buildSessionResumeState({
    messages: [
      message({ id: "m1", role: "ASSISTANT", content: "Tell me about yourself." }),
      message({ id: "m2", role: "USER", content: "I led the platform team." }),
    ],
    questions,
  });

  assert.equal(resume.isResuming, true);
  assert.deepEqual(resume.voiceMessages, [
    { id: "m1", role: "ASSISTANT", content: "Tell me about yourself." },
    { id: "m2", role: "USER", content: "I led the platform team." },
  ]);
  assert.deepEqual(
    resume.chatMessages.map((m) => [m.id, m.role, m.content]),
    [
      ["m1", "ASSISTANT", "Tell me about yourself."],
      ["m2", "USER", "I led the platform team."],
    ],
  );
});

test("resumed drawings keep the drawing id from message content", () => {
  // Load-bearing: saveWhiteboard upserts on (sessionId, WHITEBOARD, content=drawingId). Handing back
  // any other id would make the next save insert a second row instead of updating the existing one.
  const resume = buildSessionResumeState({
    messages: [
      message({
        id: "row-uuid",
        content: "drawing-uuid",
        contentType: "WHITEBOARD",
        whiteboardData: { label: "Architecture", elements: [] },
      }),
    ],
    questions,
  });

  assert.equal(resume.drawings.length, 1);
  assert.equal(resume.drawings[0].id, "drawing-uuid");
  assert.notEqual(resume.drawings[0].id, "row-uuid");
  assert.equal(resume.drawings[0].label, "Architecture");
  assert.deepEqual(JSON.parse(resume.drawings[0].snapshotData), {
    label: "Architecture",
    elements: [],
  });
});

test("drawings are kept out of the transcripts", () => {
  const resume = buildSessionResumeState({
    messages: [
      message({ id: "m1", content: "Spoken answer." }),
      message({
        id: "m2",
        content: "drawing-uuid",
        contentType: "WHITEBOARD",
        whiteboardData: { label: "Sketch" },
      }),
    ],
    questions,
  });

  assert.deepEqual(resume.voiceMessages.map((m) => m.id), ["m1"]);
  assert.deepEqual(resume.chatMessages.map((m) => m.id), ["m1"]);
  assert.deepEqual(resume.drawings.map((d) => d.id), ["drawing-uuid"]);
});

test("a drawing with no snapshot is skipped", () => {
  const resume = buildSessionResumeState({
    messages: [
      message({ id: "m1", content: "drawing-uuid", contentType: "WHITEBOARD" }),
    ],
    questions,
  });

  assert.deepEqual(resume.drawings, []);
});

test("non-text attachments stay in chat but out of the spoken transcript", () => {
  const resume = buildSessionResumeState({
    messages: [
      message({ id: "m1", content: "Spoken answer." }),
      message({ id: "m2", content: "solution.py", contentType: "CODE" }),
      message({ id: "m3", content: "diagram.png", contentType: "IMAGE" }),
    ],
    questions,
  });

  assert.deepEqual(resume.voiceMessages.map((m) => m.id), ["m1"]);
  assert.deepEqual(resume.chatMessages.map((m) => m.id), ["m1", "m2", "m3"]);
});

test("system text such as question transitions is kept in both transcripts", () => {
  const resume = buildSessionResumeState({
    messages: [message({ id: "m1", role: "SYSTEM", content: "Moving to question 2." })],
    questions,
  });

  assert.deepEqual(resume.voiceMessages.map((m) => m.role), ["SYSTEM"]);
  assert.deepEqual(resume.chatMessages.map((m) => m.role), ["SYSTEM"]);
});

test("messages are ordered by timestamp regardless of input order", () => {
  const resume = buildSessionResumeState({
    messages: [
      message({ id: "second", timestamp: "2026-07-26T10:00:02.000Z" }),
      message({ id: "third", timestamp: "2026-07-26T10:00:03.000Z" }),
      message({ id: "first", timestamp: "2026-07-26T10:00:01.000Z" }),
    ],
    questions,
  });

  assert.deepEqual(resume.voiceMessages.map((m) => m.id), ["first", "second", "third"]);
});

test("a missing content type is treated as a spoken turn", () => {
  const resume = buildSessionResumeState({
    messages: [{ id: "m1", role: "USER", content: "Answer.", contentType: null }],
    questions,
  });

  assert.deepEqual(resume.voiceMessages.map((m) => m.id), ["m1"]);
});

test("the session's own question wins over the fallback", () => {
  const resume = buildSessionResumeState({
    currentQuestionId: "q3",
    fallbackQuestionId: "q2",
    questions,
  });

  assert.equal(resume.questionIndex, 2);
  assert.equal(resume.hasQuestion, true);
});

test("the fallback question applies only when the session has none", () => {
  const resume = buildSessionResumeState({
    fallbackQuestionId: "q2",
    questions,
  });

  assert.equal(resume.questionIndex, 1);
  assert.equal(resume.hasQuestion, true);
});

test("the resume index follows question order, not the order rows arrived in", () => {
  // Regression: candidate.getByToken returned questions unsorted, so the first question sat at array
  // index 2. The relay resolves startQuestionIndex against order-sorted questions, so a brand new
  // session opened on question 3 and looked like it had resumed someone else's interview.
  const unordered = [
    { id: "q3", order: 2 },
    { id: "q2", order: 1 },
    { id: "q1", order: 0 },
    { id: "q4", order: 3 },
  ];

  assert.equal(
    buildSessionResumeState({ currentQuestionId: "q1", questions: unordered }).questionIndex,
    0,
  );
  assert.equal(
    buildSessionResumeState({ currentQuestionId: "q3", questions: unordered }).questionIndex,
    2,
  );
  assert.equal(
    buildSessionResumeState({ currentQuestionId: "q4", questions: unordered }).questionIndex,
    3,
  );
});

test("questions with no order field keep the order they were given", () => {
  const resume = buildSessionResumeState({
    currentQuestionId: "q2",
    questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }],
  });

  assert.equal(resume.questionIndex, 1);
});

test("a question that no longer exists falls back to the start", () => {
  // Questions can be edited between visits, so a stale id must not resume out of range.
  const resume = buildSessionResumeState({
    currentQuestionId: "deleted-question",
    questions,
  });

  assert.equal(resume.questionIndex, 0);
});

test("a stale session question still defers to a usable fallback", () => {
  const resume = buildSessionResumeState({
    currentQuestionId: "deleted-question",
    fallbackQuestionId: "q3",
    questions,
  });

  assert.equal(resume.questionIndex, 2);
});

test("no question at all leaves the interface on its own default", () => {
  const resume = buildSessionResumeState({ questions });

  assert.equal(resume.hasQuestion, false);
  assert.equal(resume.questionIndex, 0);
});

test("an interview with no questions loaded does not throw", () => {
  const resume = buildSessionResumeState({ currentQuestionId: "q1" });

  assert.equal(resume.questionIndex, 0);
  assert.equal(resume.hasQuestion, true);
});
