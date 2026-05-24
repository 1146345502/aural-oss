const TOKEN_REGEX =
  /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[a-z0-9\u00c0-\u024f]+/g;

function tokenize(text: string): string[] {
  return text.trim().toLowerCase().match(TOKEN_REGEX) ?? [];
}

function tokenizeWithPositions(text: string): { token: string; start: number }[] {
  const results: { token: string; start: number }[] = [];
  const regex = new RegExp(TOKEN_REGEX.source, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({ token: match[0].toLowerCase(), start: match.index });
  }
  return results;
}

function commonPrefixLength(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length);
  let count = 0;
  while (count < max && a[count] === b[count]) count++;
  return count;
}

function suffixPrefixOverlap(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len--) {
    let ok = true;
    for (let i = 0; i < len; i++) {
      if (a[a.length - len + i] !== b[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return len;
  }
  return 0;
}

function commonSubsequenceLength(a: string[], b: string[]): number {
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

function tokenSimilarity(a: string[], b: string[]): number {
  const shorter = Math.min(a.length, b.length);
  if (shorter === 0) return 0;
  return commonSubsequenceLength(a, b) / shorter;
}

function containsTokenSpan(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let ok = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function splitSentenceLikeParts(text: string): string[] {
  return text
    .match(/[^.!?。！？]+[.!?。！？]?/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [text.trim()].filter(Boolean);
}

/**
 * Detect runs of 3+ consecutive short (1-3 word) period-terminated segments
 * and join them with spaces. These are ASR rolling-revision artifacts where each
 * word-level hypothesis was appended instead of merged.
 */
function isPeriodArtifactSegment(part: string): boolean {
  const trimmed = part.trim();
  if (!/\.$/.test(trimmed)) return false;
  const stripped = trimmed.replace(/\.+$/, "").trim();
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(stripped)) return false;
  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  return wordCount >= 1 && wordCount <= 3;
}

/**
 * Strip isolated CJK characters/fragments from predominantly English/Latin text.
 * Volcengine ASR sometimes hallucinates Chinese characters during long English
 * speech sessions (e.g., "i also.调应 the ai models").
 */
export function stripIsolatedCjk(text: string): string {
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

export function cleanPeriodArtifacts(text: string): string {
  // First collapse adjacent sentence-level revisions (handles duplication
  // across any punctuation, e.g. "How's my users? How's my users to download...")
  const deduped = collapseAdjacentInterimRevisions(stripIsolatedCjk(text));

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
      const stripped = parts.slice(i, runEnd)
        .map(p => p.replace(/\.+$/, "").trim())
        .filter(Boolean);

      const deduped: string[] = [];
      for (const seg of stripped) {
        const prev = deduped[deduped.length - 1];
        if (prev) {
          const prevToks = tokenize(prev);
          const curToks = tokenize(seg);
          if (containsTokenSpan(curToks, prevToks)) {
            deduped[deduped.length - 1] = seg;
            continue;
          }
          if (containsTokenSpan(prevToks, curToks)) continue;
        }
        deduped.push(seg);
      }

      result.push(deduped.join(" ") + ".");
      i = runEnd;
    } else {
      result.push(parts[i]);
      i++;
    }
  }

  if (result.length === 0) return deduped.replace(/[.?]\s+([a-z])/g, " $1");
  return cjkAwareJoinParts(result).replace(/[.?]\s+([a-z])/g, " $1");
}

/**
 * Strip all sentence-ending punctuation for interim ASR display.
 * During speaking, all periods are likely artifacts — the final text
 * from the server will have proper punctuation.
 */
export function stripInterimPunctuation(text: string): string {
  return text
    .replace(/[.!?。！？]+\s+/g, " ")
    .replace(/[.!?。！？]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cjkAwareJoinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  let out = parts[0];
  for (let k = 1; k < parts.length; k++) {
    const lastChar = out.slice(-1);
    const firstChar = parts[k][0] || "";
    const needsSpace =
      !/[\u4e00-\u9fff\u3400-\u4dbf。！？]/.test(lastChar) &&
      !/[\u4e00-\u9fff\u3400-\u4dbf]/.test(firstChar);
    out += (needsSpace ? " " : "") + parts[k];
  }
  return out.replace(/\s+/g, " ").trim();
}

function areAdjacentInterimRevisions(first: string, second: string): boolean {
  const firstTokens = tokenize(first);
  const secondTokens = tokenize(second);
  if (firstTokens.length === 0 || secondTokens.length === 0) return false;

  if (firstTokens.join(" ") === secondTokens.join(" ")) return true;
  if (containsTokenSpan(firstTokens, secondTokens)) return true;
  if (containsTokenSpan(secondTokens, firstTokens)) return true;

  const shorter = Math.min(firstTokens.length, secondTokens.length);
  if (shorter < 3) return false;

  const prefix = commonPrefixLength(firstTokens, secondTokens);
  const revisionThreshold =
    shorter <= 5
      ? Math.max(2, Math.ceil(shorter * 0.5))
      : Math.max(4, Math.ceil(shorter * 0.6));
  if (prefix >= revisionThreshold) return true;

  if (prefix >= 2 && tokenSimilarity(firstTokens, secondTokens) >= 0.82) return true;

  // ASR sometimes misrecognises the first word of a rolling revision
  // (e.g. "Arthur" vs "Artificial") while keeping the rest identical.
  if (shorter >= 6 && tokenSimilarity(firstTokens, secondTokens) >= 0.65) return true;

  return false;
}

function collapseAdjacentInterimRevisions(text: string): string {
  const parts = splitSentenceLikeParts(text);
  if (parts.length < 2) return text;

  const collapsed: string[] = [];
  for (const part of parts) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && areAdjacentInterimRevisions(previous, part)) {
      const previousLength = tokenize(previous).length;
      const nextLength = tokenize(part).length;
      collapsed[collapsed.length - 1] = nextLength >= previousLength ? part : previous;
    } else {
      collapsed.push(part);
    }
  }

  return collapsed.join(" ");
}

/**
 * Trim the overlapping prefix of `incoming` that repeats the tail of `previous`.
 * Handles cross-turn duplication when ASR rotation splits continuous speech.
 * Tolerates up to 3 leading connector tokens in `incoming` before the overlap.
 */
export function trimCrossTurnOverlap(previous: string, incoming: string): string {
  if (!previous || !incoming) return incoming;

  const prevTokens = tokenize(previous);
  const incTokens = tokenize(incoming);

  if (prevTokens.length < 3 || incTokens.length < 3) return incoming;

  const maxSkip = Math.min(3, incTokens.length - 3);
  for (let skip = 0; skip <= maxSkip; skip++) {
    const overlap = suffixPrefixOverlap(prevTokens, incTokens.slice(skip));
    if (overlap >= 3) {
      const words = incoming.split(/\s+/);
      const tail = words.slice(skip + overlap).join(" ").trim();
      return tail || incoming;
    }
  }

  return incoming;
}

/**
 * Merge the browser's interim buffer with the relay's authoritative final text.
 * Keeps the buffer prefix (early interims the relay may not cover) but replaces
 * the overlapping tail with the clean relay text to avoid period-separated words.
 */
export function mergeAsrFinal(buffer: string, relayFinal: string): string {
  const buf = buffer.replace(/\s+/g, " ").trim();
  const fin = relayFinal.replace(/\s+/g, " ").trim();
  if (!buf) return fin;
  if (!fin) return buf;

  const bufTokens = tokenize(buf);
  const finTokens = tokenize(fin);
  if (bufTokens.length === 0) return fin;
  if (finTokens.length === 0) return buf;

  const bufKey = bufTokens.join(" ");
  const finKey = finTokens.join(" ");
  if (bufKey === finKey) return fin;
  if (finTokens.length >= bufTokens.length) return fin;

  // Find where the relay final's tokens start in the buffer's tokens.
  const spanStart = findLastTokenSpanStart(bufTokens, finTokens);
  if (spanStart > 0) {
    const prefix = rawTextBeforeToken(buf, spanStart);
    if (prefix) {
      const prefixTokens = tokenize(prefix);
      if (
        prefixTokens.length > 0 &&
        (containsTokenSpan(finTokens, prefixTokens) ||
          tokenSimilarity(prefixTokens, finTokens) >= 0.6)
      ) {
        return fin;
      }
      const adjusted = lowercaseIfMidSentence(prefix, fin);
      return `${prefix} ${adjusted}`;
    }
    return fin;
  }
  if (spanStart === 0) return fin;

  // Try suffix-prefix overlap (relay continues the buffer)
  const overlap = suffixPrefixOverlap(bufTokens, finTokens);
  if (overlap > 0) {
    const finWords = fin.split(/\s+/);
    return `${buf} ${finWords.slice(overlap).join(" ")}`.trim();
  }

  return `${buf} ${fin}`;
}

function lowercaseIfMidSentence(prefix: string, text: string): string {
  if (/[.!?。！？]\s*$/.test(prefix)) return text;
  if (/^[A-Z][a-z]/.test(text)) return text[0].toLowerCase() + text.slice(1);
  return text;
}

function findLastTokenSpanStart(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  const minMatch = Math.min(3, needle.length);

  for (let start = haystack.length - needle.length; start >= 0; start--) {
    const overlap = commonPrefixLength(haystack.slice(start), needle);
    if (overlap >= minMatch) return start;
  }
  return -1;
}

function rawTextBeforeToken(rawText: string, tokenIndex: number): string {
  const positions = tokenizeWithPositions(rawText);
  if (tokenIndex >= positions.length) return rawText.trim();
  return rawText.slice(0, positions[tokenIndex].start).trim();
}

export function mergeClientAsrInterim(existing: string, incoming: string): string {
  const current = collapseAdjacentInterimRevisions(existing.replace(/\s+/g, " ").trim());
  const next = collapseAdjacentInterimRevisions(incoming.replace(/\s+/g, " ").trim());
  if (!current) return next;
  if (!next) return current;

  const currentTokens = tokenize(current);
  const nextTokens = tokenize(next);
  if (currentTokens.length === 0) return next;
  if (nextTokens.length === 0) return current;

  const currentKey = currentTokens.join(" ");
  const nextKey = nextTokens.join(" ");
  if (currentKey === nextKey) return next.length >= current.length ? next : current;
  if (containsTokenSpan(currentTokens, nextTokens)) return current;
  if (containsTokenSpan(nextTokens, currentTokens)) return next;

  const shorter = Math.min(currentTokens.length, nextTokens.length);
  const prefix = commonPrefixLength(currentTokens, nextTokens);
  const revisionThreshold =
    shorter <= 5
      ? Math.max(2, Math.ceil(shorter * 0.5))
      : Math.max(4, Math.ceil(shorter * 0.6));
  if (prefix >= revisionThreshold) {
    return nextTokens.length >= currentTokens.length ? next : current;
  }

  if (prefix >= 2 && tokenSimilarity(currentTokens, nextTokens) >= 0.82) {
    return nextTokens.length >= currentTokens.length ? next : current;
  }

  if (shorter >= 6 && tokenSimilarity(currentTokens, nextTokens) >= 0.65) {
    return nextTokens.length >= currentTokens.length ? next : current;
  }

  const overlap = suffixPrefixOverlap(currentTokens, nextTokens);
  if (overlap > 0) {
    const nextWords = next.split(/\s+/);
    return `${current} ${nextWords.slice(overlap).join(" ")}`.trim();
  }

  return `${current} ${next}`;
}
