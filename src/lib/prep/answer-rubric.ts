/** Shared coaching criteria for suggested answers and live grading. */

export type PrepStructureLabel = "STAR" | "PAR" | "Intro" | "Technical";

export function prepScoringRubricBlock(language: string): string {
  const isZh = language === "zh" || language.toLowerCase().startsWith("zh");
  if (isZh) {
    return `统一评分标准（生成参考答案与给分必须一致）：
- 1-2 分：未回答问题（仅打招呼、测麦、无关闲聊）。不要表扬相关性。
- 1-3 分：复述教练/上轮反馈、只写“该怎么答”的计划、未进入角色扮演、未给出针对题干情境的具体话术或行动。即使文字较长也不得给 4 分以上；strengths 必须为空。
- 3 分：有尝试但偏题或空洞。
- 4-6 分：扣题且真正在回答问题（含情境中的具体做法/话术），但缺证据、结构或岗位匹配。
- 7-8 分：扎实、可面试使用，仍有小打磨空间。
- 9-10 分：简洁、具体、岗位匹配、可信，有简历/JD 信号与清晰结构。

高质量答案必须同时满足：
1) 直接扣题，2) 2-3 段清晰结构（行为题用 STAR；技术/案例题用问题→做法→权衡→结果），
3) 至少 1 个来自简历的可核实细节（无则省略，不编造），
4) 体现 JD/岗位关键词，5) 语气自然、适合口述。`;
  }
  return `Shared scoring criteria (sample answers and grading must match):
- 1-2: Did not answer (greeting, mic test, unrelated chat only). Do not praise relevance.
- 1-3: Repeating coach/prior feedback, meta plans ("you should say…") without delivering the actual answer, or no in-role scenario response. Long text does NOT justify 4+. strengths must be [].
- 3: Minimal attempt, mostly off-topic or empty.
- 4-6: Actually answers the question (concrete actions/script for scenarios) but lacks evidence, structure, or role fit.
- 7-8: Solid and interview-ready with minor refinements.
- 9-10: Crisp, specific, role-aligned, credible, with resume/JD signals and clear structure.

A high-scoring answer must include:
1) Direct answer to the question, 2) Clear 2-3 part structure (STAR for behavioral; problem→approach→tradeoff→outcome for technical),
3) At least one verifiable resume detail (omit if not in resume — never invent), 4) JD/role keywords, 5) Natural spoken tone.`;
}

export function prepSampleAnswerRulesBlock(language: string): string {
  const isZh = language === "zh" || language.toLowerCase().startsWith("zh");
  if (isZh) {
    return `参考答案要求：
- 按上述标准写一份应得 8-9 分的回答（不要写满 10 分空话）。
- 长度：自我介绍/动机类 80-110 字；行为/案例类 120-160 字；不超过 180 字。
- 必须写完整结尾，不要半句话截断。
- 只用简历中的事实；不要 [VERIFY] 标记或编造数据。
- 输出纯文本，不要 JSON/Markdown/标题。`;
  }
  return `Sample answer requirements:
- Write an answer that would score 8-9 on the rubric above (not hollow "10/10" fluff).
- Length: intro/why-role 80-110 words; behavioral 120-160 words; never exceed 180 words.
- Must be a complete answer with a proper ending — never stop mid-sentence.
- Use only resume facts; no [VERIFY] markers or invented metrics.
- Plain text only — no JSON, markdown, or headings.`;
}

export function inferSuggestedAnswerStructure(
  questionType: string | null | undefined,
  text: string,
): PrepStructureLabel {
  const type = (questionType ?? "").toUpperCase();
  if (
    type.includes("BEHAVIOR") ||
    type.includes("SITUATION") ||
    /经历|案例|举例|STAR|当时|结果/.test(text)
  ) {
    return "STAR";
  }
  if (
    type.includes("TECH") ||
    type.includes("SYSTEM") ||
    type.includes("DESIGN") ||
    /方案|架构|权衡|trade.?off|implement/i.test(text)
  ) {
    return "PAR";
  }
  if (
    type.includes("INTRO") ||
    type.includes("OPEN") ||
    /介绍|为什么|动机|why/i.test(text)
  ) {
    return "Intro";
  }
  return "STAR";
}

/** User-facing label for the answer structure tag. */
export function structureTagLabel(structure: PrepStructureLabel): {
  label: string;
  hint: string;
} {
  switch (structure) {
    case "STAR":
      return {
        label: "STAR story",
        hint: "Situation → action → result",
      };
    case "PAR":
      return {
        label: "Case walkthrough",
        hint: "Problem → approach → outcome",
      };
    case "Intro":
      return {
        label: "Intro arc",
        hint: "Who you are → why this role → proof point",
      };
    case "Technical":
      return {
        label: "Technical flow",
        hint: "Problem → approach → tradeoffs → outcome",
      };
    default:
      return {
        label: "STAR story",
        hint: "Situation → action → result",
      };
  }
}

/** Count speakable units (Latin words + CJK characters). */
export function countSpeakableUnits(text: string): number {
  const stripped = text.replace(/\s+/g, " ").trim();
  if (!stripped) return 0;
  const latinWords = stripped.match(/[a-zA-Z]+(?:'[a-zA-Z]+)*/g)?.length ?? 0;
  const cjkChars = stripped.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const other = stripped
    .replace(/[a-zA-Z]+(?:'[a-zA-Z]+)*/g, " ")
    .replace(/[\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return latinWords + cjkChars + other;
}

/** Deliberate interview pace (~120 wpm EN; conservative for CJK chars as units). */
const INTERVIEW_SPEAK_UNITS_PER_MINUTE = 120;

/** Rounded-up minutes so estimates never understate delivery time. */
export function estimateSpeakMinutes(units: number): number {
  if (units <= 0) return 0;
  return Math.max(1, Math.ceil(units / INTERVIEW_SPEAK_UNITS_PER_MINUTE));
}
