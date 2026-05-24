// Strong: self-referencing commands unlikely to appear as topic descriptions.
const STRONG_END_PATTERNS = [
  /(?:please|let'?s|I\s+want\s+to|can\s+we)\s+end(?:\s+(?:the\s+)?interview)?/i,
  // Require interview/here, or bare "I'm done" — not "I'm done with this question"
  /I'?m\s+done\s+with\s+(?:the\s+)?(?:interview|here)\b/i,
  /I'?m\s+done(?!\s+with\s+(?:this|that|the)\s+question)\s*[!?.]?\s*$/i,
  /that'?s\s+(?:all|it|everything)\b/i,
  /(?:结束面试|结束吧|我(?:答|做)完了|就这样吧|面试结束|(?:我们|咱们)?结束(?:答题|这?题|面试)?吧|(?:没有了?|没了)(?:，|,)?结束(?:吧)?|到这(?:里|儿)(?:就)?(?:行了|结束)?吧?)/,
];

// Contextual: can appear as natural descriptions when the user is talking ABOUT
// interviews (e.g. "my challenge was to finish the interview faster").
// Only matched for short utterances where intent is unambiguous.
const CONTEXTUAL_END_PATTERNS = [
  /(?:end|finish|stop|terminate)\s+(?:the\s+)?interview/i,
];

const USER_END_PATTERNS = [...STRONG_END_PATTERNS, ...CONTEXTUAL_END_PATTERNS];

const USER_SKIP_PATTERNS = [
  /(?:let'?s|please|can\s+(?:we|you))\s+(?:move\s+on|skip|proceed|go\s+to\s+(?:the\s+)?next)/i,
  /move\s+on(?:\s+to)?/i,
  /continue\s+to\s+(?:the\s+)?next/i,
  /go\s+(?:on\s+)?to\s+(?:the\s+)?next/i,
  /(?:please|let'?s)\s+end(?:\s+(?:this|here|now))?\.?$/i,
  /skip\s+(?:this|the)\s+(?:question|one|problem)/i,
  /I\s+(?:give\s+up|want\s+to\s+skip|'?d\s+like\s+to\s+skip)/i,
  /next\s+question/i,
  /please\s+(?:move\s+on|skip)/i,
  /(?:跳过|下一(?:个问题|题)|不做了|放弃了?|结束吧|请继续(?:下一|到下))/,
  /(?:我不会|不想做了|不想答了|过吧|换下一)/,
];

const REPLY_INVITES_MORE_PATTERNS_EN = [
  /\b(?:please|feel free to)\s+(?:share|continue|tell|describe|walk|talk|elaborate|expand|bring|mention|add|discuss|raise)\b/i,
  /\b(?:i(?:'d| would)\s+love to hear|i(?:'d| would)\s+appreciate hearing)\b/i,
  /\bwhen you'?re ready\b/i,
  /\bi'?m here (?:to listen|if you(?:'d| would)? like to continue)\b/i,
  /\bif you have\b.*\b(?:i(?:'d| would)\s+appreciate hearing|feel free to share)\b/i,
  /\b(?:could|can|would)\s+you\b/i,
  /\bif (?:there(?:'s| is) anything|you(?:'d| would) like to)\b/i,
];

const REPLY_INVITES_MORE_PATTERNS_ZH = [
  /(?:请|可以|麻烦).{0,4}(?:分享|继续|补充|说明|展开|讲讲|说说)/,
  /(?:我(?:很)?想听|我(?:很)?希望听|欢迎你).{0,6}(?:分享|继续|补充|展开)/,
  /如果你(?:还有|愿意|方便).{0,8}(?:分享|补充|继续)/,
  /你可以.{0,4}(?:继续|分享|补充|展开)/,
  /准备好了?.{0,4}(?:继续|分享|说)/,
];

export function isUserEndRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const words = trimmed.split(/\s+/);
  if (words.length <= 15) {
    return USER_END_PATTERNS.some((p) => p.test(trimmed));
  }

  // Long utterances can naturally mention "end/finish the interview" when
  // discussing interview-related topics. Only check strong patterns against
  // the trailing sentence so descriptive mentions don't trigger a false end.
  const tail = extractTrailingSentence(trimmed);
  return STRONG_END_PATTERNS.some((p) => p.test(tail));
}

function extractTrailingSentence(text: string): string {
  const trimmed = text.trim();

  // Strip trailing punctuation so we can find the boundary before the last sentence.
  const content = trimmed.replace(/[\s.!?。！？]+$/, "");
  if (!content) return trimmed;

  const match = content.match(/[.!?。！？](?=[^.!?。！？]*$)/);
  if (match?.index != null) {
    const after = content.slice(match.index + 1).trim();
    if (after) return after;
  }

  // No sentence boundary — fall back to the last 5 words for safety.
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return words.slice(-5).join(" ");
  return trimmed;
}

export function isUserSkipRequest(text: string): boolean {
  if (isUserEndRequest(text)) return false;
  return USER_SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

export function responseInvitesUserReply(text: string, isZh: boolean): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const patterns = isZh ? REPLY_INVITES_MORE_PATTERNS_ZH : REPLY_INVITES_MORE_PATTERNS_EN;
  return patterns.some((pattern) => pattern.test(normalized));
}

export function finalizeTurnBudgetResponse(input: {
  response: string;
  nextToken: string;
  mustAdvance: boolean;
  keepsConversationOpen: boolean;
  transitionResponse: string;
}): { response: string; changed: boolean } {
  if (!input.mustAdvance) {
    return { response: input.response, changed: false };
  }

  if (input.response.includes(input.nextToken) && !input.keepsConversationOpen) {
    return { response: input.response, changed: false };
  }

  const transition = input.transitionResponse.trim();
  return {
    response: `${transition} ${input.nextToken}`,
    changed: true,
  };
}

function normalizeAsrComparisonText(text: string): string {
  const normalized = Array.from(text
    .normalize("NFKC")
    .toLowerCase())
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const isAsciiLetter = code >= 97 && code <= 122;
      const isAsciiDigit = code >= 48 && code <= 57;
      const isCjk =
        (code >= 0x3400 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff);
      return isAsciiLetter || isAsciiDigit || isCjk ? char : " ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ").filter(Boolean);
  const collapsed: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const hasLetterRunAfterArticle =
      (word === "a" || word === "an" || word === "the") &&
      i + 2 < words.length &&
      words[i + 1]?.length === 1 &&
      words[i + 2]?.length === 1;

    if (hasLetterRunAfterArticle) {
      collapsed.push(word);
      continue;
    }

    if (word.length === 1 && words[i + 1]?.length === 1) {
      const run = [word];
      while (words[i + 1]?.length === 1) {
        i++;
        run.push(words[i]);
      }
      collapsed.push(run.join(""));
      continue;
    }

    collapsed.push(word);
  }

  return collapsed.join(" ");
}

interface AsrComparisonUnit {
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

function isAsciiLetter(value: string): boolean {
  return value.length === 1 && value >= "a" && value <= "z";
}

function isAsciiDigit(value: string): boolean {
  return value.length === 1 && value >= "0" && value <= "9";
}

function isAsciiAlphaNumeric(value: string): boolean {
  return isAsciiLetter(value) || isAsciiDigit(value);
}

function isCjkChar(value: string): boolean {
  const code = value.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

function isSingleAsciiLetterUnit(unit: AsrComparisonUnit | undefined): boolean {
  return !!unit && isAsciiLetter(unit.normalized);
}

function createComparisonUnit(raw: string, normalized: string, start: number, end: number): AsrComparisonUnit {
  return { raw, normalized, start, end };
}

function collapseSingleLetterRuns(units: AsrComparisonUnit[]): AsrComparisonUnit[] {
  const collapsed: AsrComparisonUnit[] = [];

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const hasLetterRunAfterArticle =
      (unit.normalized === "a" || unit.normalized === "an" || unit.normalized === "the") &&
      isSingleAsciiLetterUnit(units[i + 1]) &&
      isSingleAsciiLetterUnit(units[i + 2]);

    if (hasLetterRunAfterArticle) {
      collapsed.push(unit);
      continue;
    }

    if (isSingleAsciiLetterUnit(unit) && isSingleAsciiLetterUnit(units[i + 1])) {
      const run = [unit];
      while (isSingleAsciiLetterUnit(units[i + 1])) {
        i++;
        run.push(units[i]);
      }
      collapsed.push(createComparisonUnit(
        run.map((part) => part.raw).join(""),
        run.map((part) => part.normalized).join(""),
        run[0].start,
        run[run.length - 1].end,
      ));
      continue;
    }

    collapsed.push(unit);
  }

  return collapsed;
}

function asrComparisonUnits(text: string): AsrComparisonUnit[] {
  const units: AsrComparisonUnit[] = [];

  for (let i = 0; i < text.length;) {
    const start = i;
    const rawChar = String.fromCodePoint(text.codePointAt(i) ?? 0);
    const normalizedChar = rawChar.normalize("NFKC").toLowerCase();
    i += rawChar.length;

    if (isAsciiAlphaNumeric(normalizedChar)) {
      let raw = rawChar;
      let normalized = normalizedChar;
      let end = i;
      while (i < text.length) {
        const nextRaw = String.fromCodePoint(text.codePointAt(i) ?? 0);
        const nextNormalized = nextRaw.normalize("NFKC").toLowerCase();
        if (!isAsciiAlphaNumeric(nextNormalized)) break;
        raw += nextRaw;
        normalized += nextNormalized;
        i += nextRaw.length;
        end = i;
      }
      units.push(createComparisonUnit(raw, normalized, start, end));
      continue;
    }

    if (isCjkChar(normalizedChar)) {
      units.push(createComparisonUnit(rawChar, normalizedChar, start, i));
    }
  }

  return collapseSingleLetterRuns(units);
}

function countCommonPrefix(a: string[], b: string[]): number {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) {
    count++;
  }
  return count;
}

function longestSuffixPrefixOverlap(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len--) {
    let matches = true;
    for (let i = 0; i < len; i++) {
      if (a[a.length - len + i] !== b[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return len;
  }
  return 0;
}

function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[b.length];
}

function unitSequenceSimilarity(a: string[], b: string[]): number {
  const shorter = Math.min(a.length, b.length);
  if (shorter === 0) return 0;
  return longestCommonSubsequenceLength(a, b) / shorter;
}

function rollingRevisionPrefixThreshold(shorterUnitCount: number): number {
  if (shorterUnitCount <= 0) return Number.POSITIVE_INFINITY;
  if (shorterUnitCount <= 5) {
    return Math.max(2, Math.ceil(shorterUnitCount * 0.5));
  }
  return Math.max(4, Math.ceil(shorterUnitCount * 0.6));
}

function hasApproximateContainedSpan(existing: string[], incoming: string[]): boolean {
  if (incoming.length < 8 || existing.length <= incoming.length) return false;

  const extraWindow = Math.max(2, Math.ceil(incoming.length * 0.25));
  const requiredMatches = Math.max(8, Math.ceil(incoming.length * 0.82));

  for (let start = 0; start < existing.length; start++) {
    const end = Math.min(existing.length, start + incoming.length + extraWindow);
    const window = existing.slice(start, end);
    if (window.length < requiredMatches) break;

    const matches = longestCommonSubsequenceLength(window, incoming);
    if (matches >= requiredMatches) return true;
  }

  return false;
}

function hasRepeatStartBoundary(text: string, start: number): boolean {
  const prefix = text.slice(0, start).trimEnd();
  if (!prefix) return true;
  return /[，。！？、,.!?;；:：]$/.test(prefix);
}

function splitSentenceLikeParts(text: string): string[] {
  return text
    .match(/[^.!?。！？]+[.!?。！？]?/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [text.trim()].filter(Boolean);
}

function containsUnitSpan(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true;
  if (haystack.length < needle.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let ok = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function areAdjacentAsrRevisions(first: string, second: string): boolean {
  const firstUnits = asrComparisonUnits(first).map((unit) => unit.normalized);
  const secondUnits = asrComparisonUnits(second).map((unit) => unit.normalized);
  if (firstUnits.length === 0 || secondUnits.length === 0) return false;

  if (firstUnits.join(" ") === secondUnits.join(" ")) return true;
  if (containsUnitSpan(firstUnits, secondUnits)) return true;
  if (containsUnitSpan(secondUnits, firstUnits)) return true;

  const shorter = Math.min(firstUnits.length, secondUnits.length);
  if (shorter < 3) return false;

  const commonPrefix = countCommonPrefix(firstUnits, secondUnits);
  if (commonPrefix >= rollingRevisionPrefixThreshold(shorter)) return true;

  if (commonPrefix >= 2 && unitSequenceSimilarity(firstUnits, secondUnits) >= 0.82) return true;

  // ASR sometimes misrecognises the first word of a rolling revision
  // (e.g. "Arthur" vs "Artificial") while keeping the rest identical.
  if (shorter >= 6 && unitSequenceSimilarity(firstUnits, secondUnits) >= 0.65) return true;

  return false;
}

function collapseAdjacentSentenceRevisions(text: string): string {
  const parts = splitSentenceLikeParts(text);
  if (parts.length < 2) return text;

  const collapsed: string[] = [];
  for (const part of parts) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && areAdjacentAsrRevisions(previous, part)) {
      const previousLength = asrComparisonUnits(previous).length;
      const nextLength = asrComparisonUnits(part).length;
      collapsed[collapsed.length - 1] = nextLength >= previousLength ? part : previous;
    } else {
      collapsed.push(part);
    }
  }

  return collapsed.reduce((acc, part) => joinAsrTail(acc, part));
}

function isPeriodArtifactSegment(part: string): boolean {
  const trimmed = part.trim();
  if (!/\.$/.test(trimmed)) return false;
  const stripped = trimmed.replace(/\.+$/, "").trim();
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(stripped)) return false;
  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  return wordCount >= 1 && wordCount <= 3;
}

function stripIsolatedCjk(text: string): string {
  const totalChars = text.replace(/\s+/g, "").length;
  if (totalChars === 0) return text;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  if (cjkChars === 0) return text;
  if (cjkChars / totalChars > 0.2) return text;

  return text
    .replace(/[.。]?[\u4e00-\u9fff\u3400-\u4dbf]+[.。]?/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanPeriodRunArtifacts(text: string): string {
  const deduped = collapseAdjacentSentenceRevisions(stripIsolatedCjk(text));
  const parts = splitSentenceLikeParts(deduped);
  if (parts.length < 3) {
    return deduped.replace(/[.?]\s+([a-z])/g, " $1");
  }

  const result: string[] = [];
  let i = 0;

  while (i < parts.length) {
    let runEnd = i;
    while (runEnd < parts.length && isPeriodArtifactSegment(parts[runEnd])) {
      runEnd++;
    }

    const runLen = runEnd - i;
    if (runLen >= 3) {
      const joined = parts.slice(i, runEnd)
        .map(p => p.replace(/\.+$/, "").trim())
        .filter(Boolean)
        .join(" ");
      const collapsed = collapseAdjacentSentenceRevisions(joined + ".");
      result.push(collapsed);
      i = runEnd;
    } else {
      result.push(parts[i]);
      i++;
    }
  }

  if (result.length === 0) return deduped.replace(/[.?]\s+([a-z])/g, " $1");
  const joined = result.reduce((acc, part) => joinAsrTail(acc, part));
  return joined.replace(/[.?]\s+([a-z])/g, " $1");
}

export function collapseInternalAsrRepetitions(text: string): string {
  let out = collapseAdjacentSentenceRevisions(text);
  out = cleanPeriodRunArtifacts(out);

  for (let pass = 0; pass < 10; pass++) {
    const units = asrComparisonUnits(out);
    const norm = units.map((unit) => unit.normalized);
    let changed = false;

    for (let start = 0; start < units.length; start++) {
      if (!hasRepeatStartBoundary(out, units[start].start)) continue;

      const maxLen = Math.min(80, Math.floor((units.length - start) / 2));
      for (let len = maxLen; len >= 10; len--) {
        const first = norm.slice(start, start + len);
        const second = norm.slice(start + len, start + len * 2);
        if (countCommonPrefix(first, second) < Math.min(6, len)) continue;
        if (unitSequenceSimilarity(first, second) < 0.86) continue;

        const removeStart = units[start + len].start;
        const removeEnd = units[start + len * 2 - 1].end;
        out = `${out.slice(0, removeStart)}${out.slice(removeEnd)}`;
        out = out.replace(/([，。！？、,.!?;；:：])\1+/g, "$1");
        changed = true;
        break;
      }
      if (changed) break;
    }

    if (!changed) return out;
  }

  return out;
}

function joinAsrTail(existing: string, tail: string): string {
  const trimmedTail = tail.trimStart();
  if (!trimmedTail) return existing;

  const last = existing.trimEnd().slice(-1);
  const first = trimmedTail[0];
  if (/[，。！？、,.!?;；:：)]/.test(first)) {
    if (last && /[，。！？、,.!?;；:：]/.test(last)) {
      return `${existing}${trimmedTail.slice(1)}`;
    }
    return `${existing}${trimmedTail}`;
  }

  if (/[。！？]/.test(last) && isCjkChar(first)) return `${existing}${trimmedTail}`;
  if (last && isCjkChar(last) && isCjkChar(first)) return `${existing}${trimmedTail}`;
  return `${existing} ${trimmedTail}`;
}

function incomingTailAfterOverlap(incoming: string, units: AsrComparisonUnit[], overlap: number): string {
  if (overlap <= 0) return incoming.trim();
  if (overlap >= units.length) return "";
  return incoming.slice(units[overlap - 1].end);
}

export function isAsrRollingRevision(existing: string, incoming: string): boolean {
  const a = existing.replace(/\s+/g, " ").trim();
  const b = incoming.replace(/\s+/g, " ").trim();
  if (!a || !b) return false;

  const an = normalizeAsrComparisonText(a);
  const bn = normalizeAsrComparisonText(b);
  if (!bn || an === bn || an.includes(bn) || bn.includes(an)) return true;

  const aUnits = asrComparisonUnits(a);
  const bUnits = asrComparisonUnits(b);
  const aNorm = aUnits.map((unit) => unit.normalized);
  const bNorm = bUnits.map((unit) => unit.normalized);
  const shorter = Math.min(aNorm.length, bNorm.length);
  if (shorter <= 0) return false;

  const commonPrefix = countCommonPrefix(aNorm, bNorm);
  const revisionThreshold = rollingRevisionPrefixThreshold(shorter);
  if (commonPrefix >= revisionThreshold) return true;

  const overlap = longestSuffixPrefixOverlap(aNorm, bNorm);
  if (overlap >= Math.min(3, shorter)) return true;

  return hasApproximateContainedSpan(aNorm, bNorm);
}

export function shouldSuppressAnsweredAsrFinal(
  answeredUserText: string,
  incoming: string,
): boolean {
  const answered = answeredUserText.replace(/\s+/g, " ").trim();
  const text = incoming.replace(/\s+/g, " ").trim();
  if (!answered || !text) return false;

  const answeredKey = normalizeAsrComparisonText(answered);
  const textKey = normalizeAsrComparisonText(text);
  return answeredKey === textKey || isAsrRollingRevision(answered, text);
}

export interface RecentAsrFinal {
  text: string;
  at: number;
}

export function shouldSuppressRecentAsrFinal(
  incoming: string,
  recentFinals: readonly RecentAsrFinal[],
  now = Date.now(),
  options?: {
    ttlMs?: number;
    minComparisonUnits?: number;
  },
): boolean {
  const text = incoming.replace(/\s+/g, " ").trim();
  if (!text) return false;

  const minComparisonUnits = options?.minComparisonUnits ?? 8;
  if (asrComparisonUnits(text).length < minComparisonUnits) return false;

  const ttlMs = options?.ttlMs ?? 90_000;
  return recentFinals.some((entry) => (
    now - entry.at <= ttlMs &&
    shouldSuppressAnsweredAsrFinal(entry.text, text)
  ));
}

export function shouldHoldBargeInInterimForFinal(input: {
  text: string;
  definite: boolean;
  ttsSpeaking: boolean;
  endingInterview: boolean;
}): boolean {
  return (
    !input.endingInterview &&
    input.ttsSpeaking &&
    !input.definite &&
    input.text.trim().length >= 2
  );
}

/**
 * Volcengine ASR streams are rolling hypotheses, not guaranteed deltas. Merge them as revisions
 * when they heavily overlap; append only when the incoming text is a true continuation.
 */
export function mergeAsrSegments(existing: string, incoming: string): string {
  const a = collapseInternalAsrRepetitions(existing.replace(/\s+/g, " ").trim());
  const b = collapseInternalAsrRepetitions(incoming.replace(/\s+/g, " ").trim());
  if (!a) return b;
  if (!b) return a;

  const an = normalizeAsrComparisonText(a);
  const bn = normalizeAsrComparisonText(b);
  if (!bn || an === bn || an.includes(bn)) return a;
  if (bn.includes(an)) return b;

  const aUnits = asrComparisonUnits(a);
  const bUnits = asrComparisonUnits(b);
  const aNorm = aUnits.map((unit) => unit.normalized);
  const bNorm = bUnits.map((unit) => unit.normalized);
  const shorter = Math.min(aNorm.length, bNorm.length);

  if (shorter > 0) {
    const commonPrefix = countCommonPrefix(aNorm, bNorm);
    const revisionThreshold = rollingRevisionPrefixThreshold(shorter);
    if (commonPrefix >= revisionThreshold) {
      return bNorm.length >= aNorm.length ? b : a;
    }

    if (commonPrefix >= 2 && unitSequenceSimilarity(aNorm, bNorm) >= 0.82) {
      return bNorm.length >= aNorm.length ? b : a;
    }

    const overlap = longestSuffixPrefixOverlap(aNorm, bNorm);
    if (overlap >= Math.min(3, shorter)) {
      const tail = incomingTailAfterOverlap(b, bUnits, overlap);
      return joinAsrTail(a, tail);
    }

    if (bNorm.length <= 4 && overlap > 0) {
      const tail = incomingTailAfterOverlap(b, bUnits, overlap);
      return joinAsrTail(a, tail);
    }

    if (shorter >= 6 && unitSequenceSimilarity(aNorm, bNorm) >= 0.65) {
      return bNorm.length >= aNorm.length ? b : a;
    }
  }

  return joinAsrTail(a, b);
}

/**
 * Trim the overlapping prefix of `incoming` that repeats the tail of `previous`.
 * Handles the case where a 30s ASR rotation splits continuous speech, causing the
 * continuation (barge-in) to repeat the end of the committed turn.
 * Tolerates up to 3 leading connector tokens ("And", "So", etc.) in `incoming`
 * that may precede the overlapping span.
 */
export function trimCrossTurnOverlap(previous: string, incoming: string): string {
  if (!previous || !incoming) return incoming;

  const prevUnits = asrComparisonUnits(previous);
  const incUnits = asrComparisonUnits(incoming);
  const prevNorm = prevUnits.map((u) => u.normalized);
  const incNorm = incUnits.map((u) => u.normalized);

  if (prevNorm.length < 3 || incNorm.length < 3) return incoming;

  const maxSkip = Math.min(3, incNorm.length - 3);
  for (let skip = 0; skip <= maxSkip; skip++) {
    const overlap = longestSuffixPrefixOverlap(prevNorm, incNorm.slice(skip));
    if (overlap >= 3) {
      const trimAt = skip + overlap;
      const tail = incomingTailAfterOverlap(incoming, incUnits, trimAt);
      return tail.trim() || incoming;
    }
  }

  return incoming;
}

export function mergePendingAsrInterim(
  existing: string,
  incoming: string,
): { text: string; changed: boolean } {
  const text = mergeAsrSegments(existing, incoming);
  return {
    text,
    changed: normalizeAsrComparisonText(existing) !== normalizeAsrComparisonText(text),
  };
}
