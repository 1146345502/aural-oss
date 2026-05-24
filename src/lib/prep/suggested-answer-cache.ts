export type SuggestedAnswerCacheEntry = {
  hint: string;
  questionType: string | null;
};

const cache = new Map<string, SuggestedAnswerCacheEntry>();

export function suggestedAnswerCacheKey(
  interviewId: string,
  questionId: string,
): string {
  return `${interviewId}:${questionId}`;
}

export function getSuggestedAnswerCache(
  interviewId: string,
  questionId: string,
): SuggestedAnswerCacheEntry | undefined {
  return cache.get(suggestedAnswerCacheKey(interviewId, questionId));
}

export function setSuggestedAnswerCache(
  interviewId: string,
  questionId: string,
  entry: SuggestedAnswerCacheEntry,
): void {
  cache.set(suggestedAnswerCacheKey(interviewId, questionId), entry);
}

export function deleteSuggestedAnswerCache(
  interviewId: string,
  questionId: string,
): void {
  cache.delete(suggestedAnswerCacheKey(interviewId, questionId));
}
