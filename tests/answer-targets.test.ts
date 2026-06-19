import assert from "node:assert/strict";
import test from "node:test";

import { buildAnswerTarget } from "../src/lib/prep/answer-targets";

test("does not treat generic OPEN_ENDED questions as intro targets", () => {
  const target = buildAnswerTarget(
    "OPEN_ENDED",
    "假设一位顾客走进柜台，表现得很犹豫，说“我只是随便看看”，您会怎么与她沟通并挖掘需求？",
  );

  assert.equal(target.structure, "Service");
  assert.equal(target.structureLabel, "Service flow");
  assert.deepEqual(target.signals, ["Empathy", "Need probe", "Clear next step"]);
});

test("classifies product knowledge questions separately from service scenarios", () => {
  const target = buildAnswerTarget(
    "OPEN_ENDED",
    "请问您了解我们品牌的核心产品线吗？请说出至少3个您熟悉的系列或产品，并简述其特点和适用人群。",
  );

  assert.equal(target.structure, "Knowledge");
  assert.equal(target.structureLabel, "Knowledge map");
  assert.deepEqual(target.signals, [
    "Key categories",
    "Features",
    "Best-fit customer",
  ]);
});

test("keeps true intro prompts on the intro target", () => {
  const target = buildAnswerTarget(
    "OPEN_ENDED",
    "您好，请简单介绍一下自己，以及为什么想申请这个岗位。",
  );

  assert.equal(target.structure, "Intro");
  assert.equal(target.structureLabel, "Intro arc");
});

test("classifies choice questions as choice rationale targets", () => {
  const target = buildAnswerTarget(
    "SINGLE_CHOICE",
    "When working in a team, which approach is most effective?",
  );

  assert.equal(target.structure, "Choice");
  assert.equal(target.structureLabel, "Choice rationale");
  assert.deepEqual(target.signals, ["Selected option", "Reason", "Trade-off"]);
});

test("classifies closing prompts separately from behavioral stories", () => {
  const target = buildAnswerTarget(
    "OPEN_ENDED",
    "Is there anything else you would like to share about your leadership style or your approach to working with others that we haven't covered today?",
  );

  assert.equal(target.structure, "WrapUp");
  assert.equal(target.structureLabel, "Closing note");
  assert.deepEqual(target.signals, ["Extra signal", "Role fit", "Concise close"]);
});
