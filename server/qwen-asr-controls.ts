/** Shared controls for the two native Qwen transcription protocols. */
export function resolveQwenAsrLanguage(language?: string): "en" | "zh" | undefined {
  const value = language?.trim().toLowerCase();
  if (value === "en" || value?.startsWith("en-") || value?.startsWith("english")) return "en";
  if (value === "zh" || value?.startsWith("zh-") || value?.startsWith("chinese") || value === "中文") return "zh";
  return undefined;
}

export function resolveQwenNoiseThreshold(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new Error("QWEN_ASR_NOISE_THRESHOLD must be a number between -1 and 1");
  }
  return threshold;
}

/**
 * An isolated one/two-character Han hypothesis in an English interview is too
 * ambiguous to start a turn (e.g. background sound decoded as '再。'). Apply per
 * provider sentence, before joining history, so rejecting it cannot erase a long
 * answer. Keep mixed speech, names in English, and substantive Chinese speech.
 */
export function filterQwenTranscript(text: string, language?: string): string {
  if (resolveQwenAsrLanguage(language) !== "en") return text;
  const content = text.replace(/[\p{P}\p{Z}\s]/gu, "");
  return /^[\p{Script=Han}]{1,2}$/u.test(content) ? "" : text;
}

/** Wait for a little more evidence before a tiny Qwen draft stops playback. */
export function isQwenBargeInCandidate(text: string, definite: boolean): boolean {
  const content = text.trim();
  if (content.length < 2) return false;
  if (definite) return true;
  // Explicit short replies/interruptions remain responsive. Connectors such as
  // 'So' wait for growth or an authoritative final instead of promoting noise.
  if (/^(?:yes|no|stop|wait|hello|hi|hey|sorry|okay|ok)[.!?\s]*$/i.test(content)) return true;
  if (/^(?:是|不是|不|对|好|停|等等|等一下)[。！？\s]*$/u.test(content)) return true;
  return content.split(/\s+/).filter(Boolean).length >= 3 || (content.match(/\p{Script=Han}/gu)?.length ?? 0) >= 3;
}
