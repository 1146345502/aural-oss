/**
 * Re-entry into a live interview session from the owner's Sessions tab.
 *
 * "Test as candidate" opens a session in a new tab, so closing that tab without ending the interview
 * leaves the session IN_PROGRESS with no way back in. These helpers build the link that drops the
 * owner back into that same session instead of starting a fresh one.
 */

/** Marks the link as a re-entry so the candidate session page skips its intro screens. */
export const REOPEN_SESSION_PARAM = "resume";

export interface ReopenSessionCandidate {
  /** Session status, or null/undefined when the row has no session yet. */
  status?: string | null;
  /** Publish slug of the parent interview; the session URL is namespaced under it. */
  publicSlug?: string | null;
  isActive?: boolean | null;
}

/**
 * Only unfinished sessions can be re-entered: COMPLETED sessions render the ended screen, and
 * ABANDONED ones are rejected when sending messages, so a link to either is a dead end.
 *
 * Also requires a published, active interview, because the session route resolves the interview by
 * slug and only matches active ones.
 */
export function canReopenSession(input: ReopenSessionCandidate): boolean {
  return (
    input.status === "IN_PROGRESS" && !!input.publicSlug && input.isActive === true
  );
}

/**
 * Builds the candidate-facing URL that resumes an existing session.
 *
 * `preview=true` mirrors how "Test as candidate" opened the session in the first place: it skips
 * onboarding and leaves anti-cheating and video off. `resume=true` additionally skips the preview
 * tour, which would otherwise replay before every re-entry.
 */
export function buildReopenSessionUrl(input: {
  publicSlug: string;
  sessionId: string;
  origin?: string;
}): string {
  const params = new URLSearchParams({
    sid: input.sessionId,
    preview: "true",
    [REOPEN_SESSION_PARAM]: "true",
  });
  const path = `/i/${encodeURIComponent(input.publicSlug)}/session?${params.toString()}`;
  return input.origin ? `${input.origin}${path}` : path;
}
