import type { PrepFeedback } from "@/components/prep/prep-types";

function decodeJsonStringChunk(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractJsonStringField(
  raw: string,
  field: string,
  options?: { allowPartial?: boolean },
): string | undefined {
  const needle = `"${field}"`;
  const idx = raw.indexOf(needle);
  if (idx === -1) return undefined;

  let i = idx + needle.length;
  while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;
  if (raw[i] === ":") i += 1;
  while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;
  if (raw[i] !== '"') return undefined;
  i += 1;

  let value = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      if (i + 1 < raw.length) {
        value += raw.slice(i, i + 2);
        i += 2;
        continue;
      }
      break;
    }
    if (ch === '"') {
      return decodeJsonStringChunk(value);
    }
    value += ch;
    i += 1;
  }

  if (options?.allowPartial && value.length > 0) {
    return decodeJsonStringChunk(value);
  }
  return undefined;
}

function extractJsonStringArray(raw: string, field: string): string[] | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
  const match = raw.match(re);
  if (!match) return undefined;

  const items: string[] = [];
  const itemRe = /"((?:[^"\\]|\\.)*)"/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(match[1])) !== null) {
    items.push(decodeJsonStringChunk(itemMatch[1]));
  }
  return items;
}

const LIST_FIELDS = [
  "strengths",
  "improvements",
  "missingSignals",
  "resumeLeverage",
  "needsUserVerification",
] as const satisfies ReadonlyArray<keyof PrepFeedback>;

/**
 * Best-effort parse of in-flight feedback JSON while the model is still streaming.
 * Surfaces verdict / summary early; score is omitted until server guardrails run.
 */
export function parsePartialPrepFeedback(raw: string): Partial<PrepFeedback> | null {
  if (!raw.includes("{")) return null;

  const partial: Partial<PrepFeedback> = {};

  const verdict = extractJsonStringField(raw, "verdict");
  if (verdict) partial.verdict = verdict;

  const summary = extractJsonStringField(raw, "summary", { allowPartial: true });
  if (summary) partial.summary = summary;

  for (const field of LIST_FIELDS) {
    const items = extractJsonStringArray(raw, field);
    if (items !== undefined) partial[field] = items;
  }

  const structureSuggestion = extractJsonStringField(raw, "structureSuggestion", {
    allowPartial: true,
  });
  if (structureSuggestion) partial.structureSuggestion = structureSuggestion;

  const followUpQuestion = extractJsonStringField(raw, "followUpQuestion", {
    allowPartial: true,
  });
  if (followUpQuestion) partial.followUpQuestion = followUpQuestion;

  const sampleAnswer = extractJsonStringField(raw, "sampleAnswer", {
    allowPartial: true,
  });
  if (sampleAnswer) partial.sampleAnswer = sampleAnswer;

  return Object.keys(partial).length > 0 ? partial : null;
}

export function hasPartialFeedbackHeader(
  feedback: Partial<PrepFeedback> | PrepFeedback | undefined,
): boolean {
  if (!feedback) return false;
  return Boolean(feedback.verdict?.trim() || feedback.summary?.trim());
}
