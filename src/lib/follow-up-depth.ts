export type FollowUpDepth = "LIGHT" | "MODERATE" | "DEEP";

/** Matches the `interviews.followUpDepth` column default. */
export const DEFAULT_FOLLOW_UP_DEPTH: FollowUpDepth = "MODERATE";

/**
 * Maximum follow-ups the interviewer may ask on a single question. These numbers
 * are the contract behind the depth descriptions the creator picks from
 * (`FOLLOW_UP_DEPTHS` in `src/lib/constants.ts`), so the chat prompt and both
 * voice relays must read their limits from here instead of defining their own.
 */
const MAX_FOLLOW_UPS: Record<FollowUpDepth, number> = {
  LIGHT: 0,
  MODERATE: 2,
  DEEP: 5,
};

/**
 * RESEARCH questions exist to extract as much detail as possible, so they get
 * extra headroom — but still scaled by the configured depth rather than a flat
 * override that ignores it.
 */
const MAX_FOLLOW_UPS_RESEARCH: Record<FollowUpDepth, number> = {
  LIGHT: 2,
  MODERATE: 4,
  DEEP: 8,
};

export function normalizeFollowUpDepth(
  value: string | null | undefined,
): FollowUpDepth {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "LIGHT" ||
    normalized === "MODERATE" ||
    normalized === "DEEP"
  ) {
    return normalized;
  }
  return DEFAULT_FOLLOW_UP_DEPTH;
}

export function maxFollowUpsForDepth(
  depth: string | null | undefined,
  questionType?: string | null,
): number {
  const normalized = normalizeFollowUpDepth(depth);
  return questionType === "RESEARCH"
    ? MAX_FOLLOW_UPS_RESEARCH[normalized]
    : MAX_FOLLOW_UPS[normalized];
}
