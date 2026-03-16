// ── Core types & helpers ────────────────────────────────────────────

type LangKey = "en" | "zh";

const DEFAULT_LANG: LangKey = "en";

export type BiText = { zh: string; en: string };

export function bt(isZh: boolean, text: BiText): string {
  return isZh ? text.zh : text.en;
}

export function getLanguageKey(language?: string): LangKey {
  if (!language) return DEFAULT_LANG;
  const key = language.toLowerCase().slice(0, 2);
  if (key === "zh") return "zh";
  return DEFAULT_LANG;
}

// ── Onboarding (client-side) ────────────────────────────────────────

export const MIC_TEST_MESSAGES: Record<LangKey, string> = {
  en: "Hello! If you can hear my voice clearly, please say yes or confirm.",
  zh: "你好！如果你能清楚地听到我的声音，请说「是」或「确认」。",
};

export const POSITIVE_WORDS: Record<LangKey, string[]> = {
  en: ["yes", "yeah", "yep", "confirm", "hear", "ok", "okay", "sure", "can", "clear", "good", "fine", "right"],
  zh: ["是", "好", "确认", "听到", "可以", "没问题", "对", "嗯", "行", "能听到", "听得到", "好的"],
};

export const SPEECH_SYNTHESIS_LOCALE: Record<LangKey, string> = {
  en: "en-US",
  zh: "zh-CN",
};

export function getMicTestMessage(language?: string): string {
  return MIC_TEST_MESSAGES[getLanguageKey(language)];
}

export function getPositiveWords(language?: string): string[] {
  const key = getLanguageKey(language);
  if (key === DEFAULT_LANG) return POSITIVE_WORDS.en;
  return [...POSITIVE_WORDS[key], ...POSITIVE_WORDS.en];
}

export function getSpeechSynthesisLocale(language?: string): string {
  return SPEECH_SYNTHESIS_LOCALE[getLanguageKey(language)];
}

// ── Voice relay (server-side) ───────────────────────────────────────

export const AI_TONE_ZH: Record<string, string> = {
  professional: "专业",
  casual: "轻松",
  friendly: "友好",
};
export const AI_TONE_ZH_DEFAULT = "正式";

export const ROLE_LABELS = {
  participant: { zh: "受访者", en: "Participant" } as BiText,
  interviewer: { zh: "面试官", en: "Interviewer" } as BiText,
};

export const QUESTION_TYPE_LABEL: Record<string, BiText> = {
  CODING: { zh: "编程题", en: "coding" },
  WHITEBOARD: { zh: "白板题", en: "whiteboard" },
};

export const QUESTION_TYPE_HINT: Record<string, Record<string, BiText>> = {
  CODING: {
    start: { zh: "请使用代码编辑器编写你的解决方案。", en: "Use the code editor to write your solution." },
    continue: { zh: "请使用代码编辑器继续编写。", en: "Continue working in the code editor." },
  },
  WHITEBOARD: {
    start: { zh: "请使用白板来画出你的答案。", en: "Use the whiteboard to draw your answer." },
    continue: { zh: "请使用白板继续你的绘制。", en: "Continue working on the whiteboard." },
  },
};

export const SCREEN_PROMPT: BiText = {
  zh: "请查看屏幕上的题目描述。",
  en: "Please read the problem on your screen.",
};

export const INTERVIEW_MESSAGES = {
  defaultQuestion: { zh: "请先做一下自我介绍。", en: "Could you please introduce yourself?" } as BiText,
  wrapUp: { zh: "好的，所有问题都已经问完了。你还有什么想补充的吗？", en: "We've covered all the questions. Is there anything else you'd like to add?" } as BiText,
  farewell: { zh: "好的，非常感谢你今天的参与，祝你一切顺利，再见！", en: "Thank you so much for your time today. Best of luck, goodbye!" } as BiText,
  summaryError: { zh: "（总结生成失败）", en: "(Summary generation failed)" } as BiText,
};

// ── Summary report ──────────────────────────────────────────────────

export const LANGUAGE_DISPLAY_NAME: Record<LangKey, string> = {
  zh: "简体中文 (Simplified Chinese)",
  en: "English",
};
