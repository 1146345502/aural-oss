import assert from "node:assert/strict";
import test from "node:test";

import {
    applyPrepScoreGuardrails,
    capPrepContentScore,
    hasScenarioDelivery,
    isCoachEchoOrMetaAnswer,
    isMetaPromptOrUiPlaceholderAnswer,
    overlapsPriorCoachFeedback,
} from "../src/lib/prep/answer-quality";
import { PREP_SUGGESTED_ANSWER_EMPTY_HINT } from "../src/lib/prep/ui-copy";

const situationalQuestion =
  "假设一位顾客走进柜台，表现得很犹豫，说「我只是随便看看」，您会怎么与她沟通并挖掘需求？";

const coachEchoAnswer =
  "请重新思考一种在销售场景中的应对话术，着重展示您的服务意识。请结合您过往工作中沉淀的「客户需求分析」经验，将其转化为美妆零售中的「肤质分析」或「产品推荐」逻辑。";

const inRoleAnswer =
  "面对这位顾客，我会先笑着说「您好，欢迎随便看看，有需要随时叫我」，然后观察她停留的品类，轻声问她是自用还是送人，再顺着她的回答做肤质分析和推荐。";

test("detects coach-echo meta answers without scenario delivery", () => {
  assert.equal(
    isCoachEchoOrMetaAnswer(coachEchoAnswer, situationalQuestion),
    true,
  );
  assert.equal(hasScenarioDelivery(coachEchoAnswer), false);
  assert.equal(hasScenarioDelivery(inRoleAnswer), true);
  assert.equal(
    isCoachEchoOrMetaAnswer(inRoleAnswer, situationalQuestion),
    false,
  );
});

test("caps inflated score when feedback says answer did not enter role", () => {
  const capped = capPrepContentScore(
    coachEchoAnswer,
    6,
    {
      score: 6,
      verdict: "回答未进入角色，请直接给出应对方案",
      summary: "你的回答仍停留在复述建议的层面。",
      strengths: ["意识到要转化经验"],
    },
    { questionText: situationalQuestion },
  );
  assert.equal(capped, 3);
});

test("applyPrepScoreGuardrails clears strengths for low coach-echo scores", () => {
  const out = applyPrepScoreGuardrails(
    coachEchoAnswer,
    {
      score: 6,
      verdict: "回答未进入角色",
      summary: "复述建议，未实操。",
      strengths: ["意识到要转化经验"],
    },
    { questionText: situationalQuestion },
  );
  assert.equal(out.score, 3);
  assert.deepEqual(out.strengths, []);
});

test("detects UI placeholder / generate-sample-answer paste", () => {
  assert.equal(
    isMetaPromptOrUiPlaceholderAnswer(PREP_SUGGESTED_ANSWER_EMPTY_HINT),
    true,
  );
  const capped = applyPrepScoreGuardrails(
    PREP_SUGGESTED_ANSWER_EMPTY_HINT,
    {
      score: 9,
      verdict: "专业且逻辑严密",
      summary: "你成功地将护理经验转化为美妆BA能力。",
      strengths: ["精准映射核心需求"],
    },
    { questionText: "请简单介绍一下自己。" },
  );
  assert.equal(capped.score, 1);
  assert.deepEqual(capped.strengths, []);
});

test("detects overlap with prior coach feedback", () => {
  const priorSummary =
    "请结合过往客户需求分析经验，转化为美妆零售中的肤质分析或产品推荐逻辑。";
  assert.equal(
    overlapsPriorCoachFeedback(coachEchoAnswer, [
      {
        answerText: "随便看看。",
        feedbackSummary: priorSummary,
        feedbackImprovements: [
          "进入角色扮演，给出具体话术",
          "用 STAR 原则组织",
        ],
      },
    ]),
    true,
  );
});

test("capPrepContentScore does not penalize retries that reuse prior coach wording", () => {
  const revisedAnswer =
    "我曾耐心倾听一位敏感肌顾客，结合过往客户需求分析经验做了肤质分析，并推荐含透明质酸的产品，最终成功达成销售。";
  const capped = capPrepContentScore(
    revisedAnswer,
    7,
    {
      score: 7,
      verdict: "结构完整，迁移能力强",
      summary: "你很好地将经验迁移到了美妆销售场景。",
      strengths: ["展现极佳的同理心"],
    },
    {
      questionText: "请分享一次成功销售的经历。",
      previousAttempts: [
        {
          answerText: "我帮助过敏顾客选购产品。",
          feedbackSummary:
            "请结合过往客户需求分析经验，转化为美妆零售中的肤质分析或产品推荐逻辑。",
          feedbackImprovements: ["加入具体产品成分", "量化销售结果"],
        },
      ],
    },
  );
  assert.equal(capped, 7);

  const out = applyPrepScoreGuardrails(
    revisedAnswer,
    {
      score: 7,
      verdict: "结构完整，迁移能力强",
      summary: "你很好地将经验迁移到了美妆销售场景。",
      strengths: ["展现极佳的同理心"],
    },
    {
      questionText: "请分享一次成功销售的经历。",
      previousAttempts: [
        {
          answerText: "我帮助过敏顾客选购产品。",
          feedbackSummary:
            "请结合过往客户需求分析经验，转化为美妆零售中的肤质分析或产品推荐逻辑。",
          feedbackImprovements: ["加入具体产品成分"],
        },
      ],
    },
  );
  assert.equal(out.score, 7);
  assert.deepEqual(out.strengths, ["展现极佳的同理心"]);
});
