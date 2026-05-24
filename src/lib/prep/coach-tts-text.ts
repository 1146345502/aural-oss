/** Max characters sent to Seed TTS for coach playback (long feedback often returns empty audio). */
export const COACH_TTS_MAX_CHARS = 360;

/** Normalize punctuation that can cause Seed TTS to return success with zero audio. */
export function sanitizeTtsText(text: string): string {
  return text
    .trim()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

/** Truncate coach speech at a sentence boundary for reliable TTS synthesis. */
export function truncateForCoachTts(
  text: string,
  maxChars: number = COACH_TTS_MAX_CHARS,
): string {
  const sanitized = sanitizeTtsText(text);
  if (sanitized.length <= maxChars) return sanitized;

  const slice = sanitized.slice(0, maxChars);
  const boundaries = [
    slice.lastIndexOf("。"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("？"),
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  ];
  const last = Math.max(...boundaries);
  if (last >= Math.floor(maxChars * 0.45)) {
    return slice.slice(0, last + 1).trim();
  }
  return slice.trim();
}

export function prepareCoachTtsText(text: string): string {
  return truncateForCoachTts(sanitizeTtsText(text));
}

/** Split long coach feedback for per-sentence TTS when a single request returns no audio. */
export function splitCoachTtsSegments(text: string, maxSegments = 6): string[] {
  const sanitized = sanitizeTtsText(text);
  if (!sanitized) return [];

  const parts = sanitized
    .split(/(?<=[。！？.!?])\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [sanitized];
  return parts.slice(0, maxSegments);
}
