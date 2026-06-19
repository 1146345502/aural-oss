/** Per-question answer drafts saved locally so users can revise later. */

function draftKey(sessionId: string, questionId: string): string {
  return `aural_practice_draft:${sessionId}:${questionId}`;
}

export function loadPracticeDraft(
  sessionId: string,
  questionId: string,
): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(draftKey(sessionId, questionId));
  } catch {
    return null;
  }
}

export function savePracticeDraft(
  sessionId: string,
  questionId: string,
  text: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(draftKey(sessionId, questionId), text);
    return true;
  } catch {
    return false;
  }
}

export function clearPracticeDraft(sessionId: string, questionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(sessionId, questionId));
  } catch {
    // localStorage unavailable
  }
}
