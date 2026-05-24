import { PREP_UI_PLACEHOLDER_ANSWERS } from "@/lib/prep/ui-copy";

/** Detect whether text is primarily Chinese or English. */
export function detectAnswerLanguage(text: string): "zh" | "en" | null {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (cjk >= 2 && cjk >= latin) return "zh";
  if (latin >= 3 && latin > cjk) return "en";
  return null;
}

/** Language for coach feedback / TTS — prefer the candidate's spoken language. */
export function resolvePrepResponseLanguage(
  interviewLanguage: string,
  answerText?: string,
): string {
  const detected = answerText ? detectAnswerLanguage(answerText) : null;
  if (detected) return detected;
  const lang = interviewLanguage?.toLowerCase() ?? "en";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

const NON_SUBSTANTIVE_PATTERNS: RegExp[] = [
  /^(你好|您好)[，,]?\s*(听得到|能听到|可以听到|听得见)/,
  /^(hi|hello|hey)[,.]?\s*(can you hear|are you there|testing)/i,
  /^testing[!.]?$/i,
  /^test[!.]?$/i,
  /听得到我说话吗/,
  /能听到我说话吗/,
  /can you hear me/i,
  /are you there/i,
  /麦克风|mic(test)?/i,
];

/** True when the candidate did not attempt to answer the interview question. */
export function isNonSubstantiveAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const normalized = trimmed.replace(/\s+/g, " ");
  if (NON_SUBSTANTIVE_PATTERNS.some((p) => p.test(normalized))) {
    return true;
  }

  // Very short meta / check-in without interview content
  if (trimmed.length <= 24) {
    const metaHints =
      /听|hear|test|hello|你好|您好|在吗|听得|麦克风|mic|say something|能听到/i;
    const interviewHints =
      /因为|经验|工作|项目|客户|销售|美妆|beauty|role|team|result|负责|做过|擅长/i;
    if (metaHints.test(trimmed) && !interviewHints.test(trimmed)) {
      return true;
    }
  }

  return false;
}

const COACH_ECHO_PATTERNS: RegExp[] = [
  /请(重新)?思考/,
  /着重展示/,
  /转化为.{0,12}(逻辑|能力)/,
  /沉淀的.{0,8}经验/,
  /应对话术/,
  /服务意识/,
  /(?:而非|而不是).{0,8}(实操|练习|角色)/,
  /停留在.{0,12}(层面|水平)/,
  /复述.{0,6}建议/,
  /未进入角色/,
  /角色扮演/,
  /具体话术/,
  /STAR.{0,6}原则/,
  /please (re)?think (about|through)/i,
  /focus on demonstrating/i,
  /transform.{0,20}into/i,
  /service awareness/i,
  /role[- ]?play/i,
  /instead of (actually )?(practicing|answering)/i,
  /repeating (the )?(suggestion|feedback|coach)/i,
  /did not enter (the )?role/i,
];

const META_PROMPT_ANSWER_PATTERNS: RegExp[] = [
  /^generate\s+(a\s+)?sample\s+answer/i,
  /^write\s+(me\s+)?(a\s+)?sample\s+answer/i,
  /^create\s+(a\s+)?sample\s+answer/i,
  /^show\s+(me\s+)?(the\s+)?suggested\s+answer/i,
  /grounded\s+in\s+your\s+(jd|resume|job\s+description)/i,
  /sample\s+answer\s+(for|based\s+on|grounded)/i,
  /suggested\s+answer\s+(for|based\s+on|please)/i,
  /please\s+generate\s+(a\s+)?(sample\s+)?answer/i,
  /根据.{0,12}(简历|JD|岗位).{0,12}生成.{0,8}答案/,
  /生成.{0,8}(参考|示例|样本|标准)答案/,
  /^(请)?(给出|生成|写).{0,6}参考答案/,
];

const ANSWER_SUBSTANCE_MARKERS: RegExp[] = [
  /\b(I am|I'm|I have|I worked|my name is|my experience)\b/i,
  /我叫|我是|我有|我的|做过|负责|经历|客户|项目|销售|护理|美妆/,
];

const SITUATIONAL_QUESTION_PATTERNS: RegExp[] = [
  /假设/,
  /如果.{0,20}(顾客|客户|客人)/,
  /随便看看/,
  /走进.{0,6}(柜台|门店|店)/,
  /suppose a customer/i,
  /walks? into (the )?(counter|store)/i,
  /just (looking|browsing)/i,
];

const SCENARIO_DELIVERY_PATTERNS: RegExp[] = [
  /我会(说|先|这样|对|主动|走上|迎)/,
  /我说[:：]/,
  /面对(这位|这个|那位)/,
  /可以这样(说|沟通|回应)/,
  /您好.{0,20}(欢迎|需要|帮)/,
  /I would (say|start|approach|greet)/i,
  /I('d| will) (tell|ask|offer|say)/i,
  /"[^"]{12,}"/,
  /「[^」]{10,}」/,
];

const POOR_ATTEMPT_FEEDBACK_PATTERNS: RegExp[] = [
  /未进入角色/,
  /未回答/,
  /没有(直接|针对)/,
  /复述/,
  /停留在/,
  /偏题/,
  /空洞/,
  /只.{0,4}建议/,
  /did not (answer|enter)/i,
  /off[- ]?topic/i,
  /repeating/i,
  /meta\b/i,
  /not a direct/i,
];

export type PriorAttemptForScoring = {
  answerText: string;
  feedbackSummary: string;
  feedbackImprovements?: string[];
};

function normalizeAnswerForMatch(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** UI placeholder or a request for the AI to write an answer — not the candidate's response. */
export function isMetaPromptOrUiPlaceholderAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const norm = normalizeAnswerForMatch(trimmed);
  for (const placeholder of PREP_UI_PLACEHOLDER_ANSWERS) {
    if (norm === normalizeAnswerForMatch(placeholder)) return true;
  }

  if (META_PROMPT_ANSWER_PATTERNS.some((p) => p.test(trimmed))) {
    return true;
  }

  const asksAi =
    /^(generate|write|create|give\s+me|show\s+me|please\s+(generate|write))/i.test(
      trimmed,
    ) &&
    /sample\s+answer|suggested\s+answer|jd|resume|job\s+description|参考答案|示例答案/i.test(
      trimmed,
    );
  if (asksAi && !ANSWER_SUBSTANCE_MARKERS.some((p) => p.test(trimmed))) {
    return true;
  }

  return false;
}

/** True when the text is not a genuine self-introduction / scenario response. */
export function lacksInterviewSubstance(answerText: string): boolean {
  if (isMetaPromptOrUiPlaceholderAnswer(answerText)) return true;
  const trimmed = answerText.trim();
  if (trimmed.length < 20) return true;
  if (ANSWER_SUBSTANCE_MARKERS.some((p) => p.test(trimmed))) return false;
  if (
    /generate|sample answer|suggested answer|write me|show me|生成答案|参考答案/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return trimmed.length < 90;
}

export function isSituationalQuestion(questionText?: string): boolean {
  const q = questionText?.trim() ?? "";
  if (!q) return false;
  return SITUATIONAL_QUESTION_PATTERNS.some((p) => p.test(q));
}

/** Candidate spoke in-role with concrete scenario actions or script. */
export function hasScenarioDelivery(answerText: string): boolean {
  const trimmed = answerText.trim();
  if (!trimmed) return false;
  return SCENARIO_DELIVERY_PATTERNS.some((p) => p.test(trimmed));
}

/** Meta commentary or echo of coach tips — not an actual interview answer. */
export function isCoachEchoOrMetaAnswer(
  answerText: string,
  questionText?: string,
): boolean {
  if (isNonSubstantiveAnswer(answerText)) return false;
  if (isMetaPromptOrUiPlaceholderAnswer(answerText)) return true;

  const trimmed = answerText.trim();
  if (hasScenarioDelivery(trimmed)) return false;

  const coachHits = COACH_ECHO_PATTERNS.filter((p) => p.test(trimmed)).length;
  const instructive =
    /请|应该|需要|建议|着重|转化|原则|层面|思考|展示/i.test(trimmed) &&
    !hasScenarioDelivery(trimmed);

  if (coachHits >= 2) return true;
  if (coachHits >= 1 && instructive) return true;

  if (
    isSituationalQuestion(questionText) &&
    instructive &&
    !hasScenarioDelivery(trimmed)
  ) {
    return true;
  }

  return false;
}

function sharesSignificantTextOverlap(
  answerNorm: string,
  otherText: string,
  minLen: number,
): boolean {
  const otherNorm = normalizeForOverlap(otherText);
  if (otherNorm.length < minLen || answerNorm.length < minLen) return false;
  const shorter = answerNorm.length <= otherNorm.length ? answerNorm : otherNorm;
  const longer = answerNorm.length > otherNorm.length ? answerNorm : otherNorm;
  const maxLen = Math.min(shorter.length, 96);
  for (let len = maxLen; len >= minLen; len--) {
    for (let i = 0; i <= shorter.length - len; i++) {
      if (longer.includes(shorter.slice(i, i + len))) return true;
    }
  }
  return false;
}

function normalizeForOverlap(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(
      /[，,。．.！!？?、；;：:""''「」『』（）()\[\]【】《》〈〉—\-·…]/g,
      "",
    )
    .toLowerCase();
}

/** Answer largely copies prior attempt feedback or improvements. */
export function overlapsPriorCoachFeedback(
  answerText: string,
  previousAttempts?: PriorAttemptForScoring[],
): boolean {
  if (!previousAttempts?.length) return false;
  const answerNorm = normalizeForOverlap(answerText);
  if (answerNorm.length < 16) return false;

  for (const attempt of previousAttempts) {
    const sources = [
      attempt.feedbackSummary,
      ...(attempt.feedbackImprovements ?? []),
      attempt.answerText,
    ].filter(Boolean);

    for (const source of sources) {
      if (sharesSignificantTextOverlap(answerNorm, source, 18)) {
        return true;
      }
    }
  }

  return false;
}

export function feedbackIndicatesPoorAttempt(feedback: {
  verdict?: string;
  summary?: string;
}): boolean {
  const blob = `${feedback.verdict ?? ""} ${feedback.summary ?? ""}`;
  return POOR_ATTEMPT_FEEDBACK_PATTERNS.some((p) => p.test(blob));
}

export type PrepFeedbackScoreFields = {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
};

export type PrepScoreGuardrailContext = {
  questionText?: string;
  previousAttempts?: PriorAttemptForScoring[];
};

/** Cap inflated LLM scores for meta / coach-echo answers. */
export function capPrepContentScore(
  answerText: string,
  score: number,
  feedback: PrepFeedbackScoreFields,
  ctx?: PrepScoreGuardrailContext,
): number {
  let cap = 10;

  if (isNonSubstantiveAnswer(answerText)) cap = Math.min(cap, 2);
  if (isMetaPromptOrUiPlaceholderAnswer(answerText)) {
    cap = Math.min(cap, 1);
  } else if (lacksInterviewSubstance(answerText)) {
    cap = Math.min(cap, 2);
  }
  if (isCoachEchoOrMetaAnswer(answerText, ctx?.questionText)) {
    cap = Math.min(cap, 3);
  }
  if (feedbackIndicatesPoorAttempt(feedback)) {
    cap = Math.min(cap, 3);
  }
  if (
    isSituationalQuestion(ctx?.questionText) &&
    !hasScenarioDelivery(answerText) &&
    !isNonSubstantiveAnswer(answerText)
  ) {
    const looksLikePlan =
      /请|应该|需要|建议|思考|展示|转化|原则/i.test(answerText) &&
      !hasScenarioDelivery(answerText);
    if (looksLikePlan) cap = Math.min(cap, 3);
  }

  return Math.min(Math.max(1, score), cap);
}

export function applyPrepScoreGuardrails<
  T extends PrepFeedbackScoreFields,
>(answerText: string, feedback: T, ctx?: PrepScoreGuardrailContext): T {
  const capped = capPrepContentScore(answerText, feedback.score, feedback, ctx);
  const strengths =
    capped <= 3 &&
    (isMetaPromptOrUiPlaceholderAnswer(answerText) ||
      lacksInterviewSubstance(answerText) ||
      isCoachEchoOrMetaAnswer(answerText, ctx?.questionText) ||
      feedbackIndicatesPoorAttempt(feedback))
      ? []
      : feedback.strengths;

  return { ...feedback, score: capped, strengths };
}

/** Rough score when structured LLM JSON is unavailable. */
export function buildMetaPromptFeedback(responseLanguage: string) {
  const isZh = responseLanguage === "zh";
  return {
    score: 1,
    verdict: isZh ? "未作答，仅粘贴提示语" : "Did not answer — pasted a prompt",
    summary: isZh
      ? "你提交的是让系统生成参考答案的提示语，并不是你自己的面试回答。请用自己的话直接回答问题（例如自我介绍与求职动机），不要粘贴侧栏或教练的文案。"
      : "You submitted a prompt asking for a sample answer, not your own response. Answer the interview question in your own words (e.g. intro and motivation)—do not paste sidebar or coach text.",
    strengths: [] as string[],
    improvements: isZh
      ? [
          "阅读题目后，用第一人称写 3-5 句自我介绍。",
          "说明为什么想做美妆 BA，并举一个与客户沟通相关的经历。",
          "不要粘贴「Generate a sample answer…」或参考答案面板中的文字。",
        ]
      : [
          "Read the question and write 3-5 sentences in the first person.",
          "Explain why you want this BA role with one customer-facing example.",
          'Do not paste "Generate a sample answer…" or sidebar placeholder text.',
        ],
    missingSignals: isZh
      ? ["自我介绍", "求职动机", "真实经历细节"]
      : ["Self-introduction", "Motivation", "Real experience details"],
    resumeLeverage: [] as string[],
    structureSuggestion: isZh
      ? "结构：我是谁 → 为什么这个岗位 → 一个相关经历。"
      : "Structure: who you are → why this role → one relevant story.",
    followUpQuestion: "",
    sampleAnswer: "",
    needsUserVerification: [] as string[],
  };
}

export function scoreAnswerHeuristically(answerText: string): number {
  if (isNonSubstantiveAnswer(answerText)) return 1;
  if (isMetaPromptOrUiPlaceholderAnswer(answerText)) return 1;
  if (lacksInterviewSubstance(answerText)) return 2;
  if (isCoachEchoOrMetaAnswer(answerText)) return 2;

  const trimmed = answerText.trim();
  const len = trimmed.length;
  if (len < 18) return 2;
  if (len < 40) return 3;

  let score = 4;
  if (/我叫|我是|I am|my name|背景|经历|experience|worked/i.test(trimmed)) {
    score += 1;
  }
  if (/因为|why|想从事|感兴趣|motivat|passion|热爱|美妆|beauty|BA/i.test(trimmed)) {
    score += 1;
  }
  if (/例如|比如|for example|客户|customer|销售|达成|result|案例/i.test(trimmed)) {
    score += 1;
  }
  if (len >= 120) score += 1;
  if (len >= 220) score += 1;

  return Math.min(9, Math.max(2, score));
}

export function buildCoachEchoFeedback(responseLanguage: string) {
  const isZh = responseLanguage === "zh";
  return {
    score: 2,
    verdict: isZh ? "未作答，仅复述建议" : "Did not answer — repeated coaching tips",
    summary: isZh
      ? "你的回复是在重复教练建议或描述“应该怎么做”，并没有针对题目情境给出你会说的具体话术或行动。请直接进入角色，用第一人称回答顾客。"
      : "You repeated coaching tips or described what you should do, without answering the scenario in your own words. Respond in-role with the exact words and actions you would use.",
    strengths: [] as string[],
    improvements: isZh
      ? [
          "不要复述上轮反馈；直接模拟 BA 对顾客说的话。",
          "针对题干里的具体情境（如“随便看看”）给出 2-3 句完整话术。",
          "可结合简历举一个简短例子，但主体必须是情境应对。",
        ]
      : [
          "Do not repeat prior feedback — speak as the BA to the customer.",
          "Give 2-3 complete sentences for the exact scenario in the question.",
          "Optional: one brief resume tie-in, but the core must be the scenario response.",
        ],
    missingSignals: isZh
      ? ["情境中的具体话术", "可观察的服务行动", "与题干直接对应"]
      : ["Concrete script for the scenario", "Observable service actions", "Direct question alignment"],
    resumeLeverage: [] as string[],
    structureSuggestion: isZh
      ? "结构：面对顾客的第一句话 → 如何破冰/提问 → 如何自然引出需求或推荐。"
      : "Structure: opening line to the customer → how you engage → how you surface needs or recommend.",
    followUpQuestion: "",
    sampleAnswer: "",
    needsUserVerification: [] as string[],
  };
}

export function buildHeuristicFeedback(
  answerText: string,
  responseLanguage: string,
) {
  const isZh = responseLanguage === "zh";
  const score = scoreAnswerHeuristically(answerText);

  if (score <= 2) {
    if (isMetaPromptOrUiPlaceholderAnswer(answerText)) {
      return buildMetaPromptFeedback(responseLanguage);
    }
    if (isCoachEchoOrMetaAnswer(answerText)) {
      return buildCoachEchoFeedback(responseLanguage);
    }
    return buildNonSubstantiveFeedback(answerText, responseLanguage);
  }

  if (score <= 4) {
    return {
      score,
      verdict: isZh ? "回答过短" : "Answer too brief",
      summary: isZh
        ? "你已开始回应问题，但内容还太短。下一步请补充自我介绍、求职动机，并举一个与客户沟通相关的具体例子。"
        : "You started on the question but the answer is still too short. Add a brief intro, your motivation, and one concrete customer-facing example.",
      strengths: [] as string[],
      improvements: isZh
        ? [
            "用 1-2 句话介绍你的背景。",
            "说明为什么想做美妆 BA。",
            "举一个与客户沟通相关的具体例子。",
          ]
        : [
            "Add a 1-2 sentence background intro.",
            "Explain why you want this BA role.",
            "Include one concrete customer-facing example.",
          ],
      missingSignals: isZh
        ? ["完整自我介绍", "求职动机", "可验证的经历细节"]
        : ["Full intro", "Motivation", "Verifiable experience details"],
      resumeLeverage: [] as string[],
      structureSuggestion: isZh
        ? "结构：我是谁 → 为什么想做这份工作 → 一个相关经历。"
        : "Structure: who you are → why this role → one relevant story.",
      followUpQuestion: "",
      sampleAnswer: "",
      needsUserVerification: [] as string[],
    };
  }

  return {
    score,
    verdict: isZh ? "有基础，可再打磨" : "Solid start, room to sharpen",
    summary: isZh
      ? "你的回答已覆盖部分要点，但结构还不够清晰，证据也偏弱。建议用「我是谁 → 为什么这个岗位 → 一个具体案例」重新组织，并补充一个可量化的结果。"
      : "You hit part of the question, but the structure and evidence are still light. Reorganize as who you are → why this role → one concrete story with a measurable result.",
    strengths: isZh
      ? ["已开始回应面试问题，而不是跑题或测试设备。"]
      : ["You addressed the interview question rather than going off-topic."],
    improvements: isZh
      ? [
          "开头用一句话概括你的定位与相关经验。",
          "补充一个可量化的结果或客户案例。",
          "把动机与目标品牌/岗位更紧密地联系起来。",
        ]
      : [
          "Open with a one-sentence positioning statement.",
          "Add one measurable result or customer story.",
          "Tie motivation more directly to this brand and role.",
        ],
    missingSignals: isZh
      ? ["更具体的客户转化或销售成果", "与 JD 高度匹配的能力点"]
      : ["More specific customer or sales outcomes", "Clearer JD alignment"],
    resumeLeverage: isZh
      ? ["从简历中挑选 1-2 条与美妆零售/客户沟通最相关的经历展开。"]
      : ["Pull 1-2 resume bullets most relevant to beauty retail and customer communication."],
    structureSuggestion: isZh
      ? "结构：我是谁 → 为什么这个岗位 → 一个 STAR 案例 → 我能带来的价值。"
      : "Structure: who you are → why this role → one STAR story → value you bring.",
    followUpQuestion: "",
    sampleAnswer: "",
    needsUserVerification: [] as string[],
  };
}

export function buildNonSubstantiveFeedback(
  answerText: string,
  responseLanguage: string,
) {
  const isZh = responseLanguage === "zh";
  return {
    score: 1,
    verdict: isZh ? "未回答问题" : "Did not answer the question",
    summary: isZh
      ? "你这句话只是在确认能否听到，并没有回答面试问题。请直接介绍自己，并说明为什么想从事这份工作。"
      : "This was only a connectivity check, not an answer to the interview question. Introduce yourself and explain why you want this role.",
    strengths: [] as string[],
    improvements: isZh
      ? [
          "先简要介绍你的背景（1-2 句）。",
          "说明你为什么对美妆 BA 岗位感兴趣。",
          "结合简历举一个与客户沟通相关的具体例子。",
        ]
      : [
          "Open with a brief background (1-2 sentences).",
          "Explain why you are interested in this BA role.",
          "Add one concrete customer-facing example from your resume.",
        ],
    missingSignals: isZh
      ? ["自我介绍", "求职动机", "与岗位相关的经历或优势"]
      : ["Self-introduction", "Motivation for the role", "Relevant experience"],
    resumeLeverage: [] as string[],
    structureSuggestion: isZh
      ? "结构建议：我是谁 → 为什么想做这份工作 → 一个相关经历 → 我能带来的价值。"
      : "Structure: who you are → why this role → one relevant story → value you bring.",
    followUpQuestion: "",
    sampleAnswer: "",
    needsUserVerification: [] as string[],
  };
}
