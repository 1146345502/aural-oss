/** Strip [VERIFY: ...] markers only (safe while streaming tokens). */
export function stripVerifyMarkers(text: string): string {
  return text
    .replace(/\s*\[\s*VERIFY:\s*[^\]]+\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Remove inline [VERIFY: ...] markers and duplicate openers from suggested-answer text. */
export function stripVerifyBlocks(text: string): string {
  return dedupeParagraphs(stripVerifyMarkers(text).trim()).trim();
}

function dedupeParagraphs(text: string): string {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 2) return paragraphs.join("\n\n");

  const first = paragraphs[0];
  let second = paragraphs[1];

  if (second.startsWith(first)) {
    second = second.slice(first.length).trim();
  } else {
    for (let len = Math.min(first.length, second.length); len >= 10; len--) {
      if (second.startsWith(first.slice(0, len))) {
        second = second.slice(len).replace(/^[\s，。、；：！？]+/, "").trim();
        break;
      }
    }
    const firstSentence = first.match(/^[^。！？.!?]+[。！？.!?]?/)?.[0];
    if (firstSentence) {
      const opener = firstSentence.replace(/[。！？.!?]$/, "").trim();
      if (opener.length >= 6 && second.startsWith(opener)) {
        second = second
          .slice(opener.length)
          .replace(/^[\s，。、；：！？.!?]+/, "")
          .trim();
      }
    }
  }

  if (!second) {
    return [first, ...paragraphs.slice(2)].join("\n\n");
  }

  paragraphs[1] = second;
  return paragraphs.join("\n\n");
}

export type AnswerTextSegment = { text: string; highlight?: boolean };

/** Split a paragraph into plain and emphasized spans for key proof points. */
export function segmentAnswerHighlights(paragraph: string): AnswerTextSegment[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];

  const pattern =
    /(\d+(?:[%％]|\s*(?:years?|months?|年|个月|人|位))?)|((?:负责|擅长|具有|拥有|因为|所以|证明|成果|优势|经验)[^，。！？；]{0,22})/gi;

  const segments: AnswerTextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(trimmed)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      segments.push({ text: trimmed.slice(lastIndex, index) });
    }
    const chunk = match[0];
    if (chunk) {
      segments.push({ text: chunk, highlight: true });
      lastIndex = index + chunk.length;
    }
    if (chunk.length === 0) {
      pattern.lastIndex += 1;
    }
  }

  if (lastIndex < trimmed.length) {
    segments.push({ text: trimmed.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text: trimmed }];
}

export function splitSuggestedAnswerParagraphs(text: string): string[] {
  return stripVerifyBlocks(text)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}
