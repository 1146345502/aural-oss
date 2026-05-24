/** Suggested AI-token estimates kept for compatibility with hosted builds. */
export const PREP_FEEDBACK_TOKEN_COST = 20;
export const PREP_SUGGESTED_ANSWER_TOKEN_COST = 5;

export function prepInsufficientTokensMessage(
  balance: number,
  needed: number,
): string {
  return `AI token budget exceeded (${balance} remaining, ${needed} needed).`;
}
