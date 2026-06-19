/**
 * Suggested answers stream in two layers:
 *
 *   OUTLINE:
 *   - bullet
 *   ANSWER:
 *   full answer paragraphs
 *
 * The parser is tolerant: missing markers degrade to "everything is the answer"
 * so older cached hints and non-conforming model output still render.
 */
export type SuggestedAnswerLayers = {
  outline: string[];
  answer: string;
};

const OUTLINE_MARKER = /(?:^|\n)\s*(?:OUTLINE|大纲|要点)\s*[:：]\s*/i;
const ANSWER_MARKER = /(?:^|\n)\s*(?:ANSWER|FULL ANSWER|回答|完整回答)\s*[:：]\s*/i;

function parseOutlineLines(block: string): string[] {
  return block
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-•*·]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);
}

export function parseHintLayers(raw: string): SuggestedAnswerLayers {
  const text = raw.trim();
  if (!text) return { outline: [], answer: "" };

  const outlineMatch = OUTLINE_MARKER.exec(text);
  const answerMatch = ANSWER_MARKER.exec(text);

  if (!outlineMatch && !answerMatch) {
    return { outline: [], answer: text };
  }

  if (!outlineMatch && answerMatch) {
    return {
      outline: [],
      answer: text.slice(answerMatch.index + answerMatch[0].length).trim(),
    };
  }

  const outlineStart = outlineMatch!.index + outlineMatch![0].length;
  const outlineEnd =
    answerMatch && answerMatch.index >= outlineMatch!.index
      ? answerMatch.index
      : text.length;
  const outline = parseOutlineLines(text.slice(outlineStart, outlineEnd));

  const answer = answerMatch
    ? text.slice(answerMatch.index + answerMatch[0].length).trim()
    : "";

  return { outline, answer };
}
