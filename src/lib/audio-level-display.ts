/** Map raw mic RMS (~0–1) to a display level with stronger sensitivity for normal speech. */
export function micLevelForDisplay(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const boosted = Math.min(1, rms * 14);
  return Math.min(1, Math.pow(boosted, 0.6) * 1.1);
}
