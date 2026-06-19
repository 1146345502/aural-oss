export type SuggestedAnswerCacheEntry = {
  hint: string;
  questionType: string | null;
};

const cache = new Map<string, SuggestedAnswerCacheEntry>();
const STORAGE_PREFIX = "aural_suggested_answer:";

export function suggestedAnswerCacheKey(
  userId: string,
  interviewId: string,
  questionId: string,
): string {
  return `${userId}:${interviewId}:${questionId}`;
}

export function suggestedAnswerStorageKey(
  userId: string,
  interviewId: string,
  questionId: string,
): string {
  return `${STORAGE_PREFIX}${suggestedAnswerCacheKey(userId, interviewId, questionId)}`;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeCacheEntry(
  entry: unknown,
): SuggestedAnswerCacheEntry | undefined {
  if (!entry || typeof entry !== "object") return undefined;

  const record = entry as Record<string, unknown>;
  if (typeof record.hint !== "string" || !record.hint.trim()) {
    return undefined;
  }

  return {
    hint: record.hint,
    questionType:
      typeof record.questionType === "string" ? record.questionType : null,
  };
}

export function getSuggestedAnswerCache(
  userId: string,
  interviewId: string,
  questionId: string,
): SuggestedAnswerCacheEntry | undefined {
  const cacheKey = suggestedAnswerCacheKey(userId, interviewId, questionId);
  const memoryEntry = cache.get(cacheKey);
  if (memoryEntry) return memoryEntry;

  const storage = getLocalStorage();
  if (!storage) return undefined;

  const storageKey = suggestedAnswerStorageKey(userId, interviewId, questionId);
  try {
    const stored = storage.getItem(storageKey);
    if (!stored) return undefined;

    const entry = normalizeCacheEntry(JSON.parse(stored));
    if (!entry) {
      storage.removeItem(storageKey);
      return undefined;
    }

    cache.set(cacheKey, entry);
    return entry;
  } catch {
    return undefined;
  }
}

export function setSuggestedAnswerCache(
  userId: string,
  interviewId: string,
  questionId: string,
  entry: SuggestedAnswerCacheEntry,
): void {
  const normalized = normalizeCacheEntry(entry);
  if (!normalized) {
    deleteSuggestedAnswerCache(userId, interviewId, questionId);
    return;
  }

  cache.set(suggestedAnswerCacheKey(userId, interviewId, questionId), normalized);

  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(
      suggestedAnswerStorageKey(userId, interviewId, questionId),
      JSON.stringify(normalized),
    );
  } catch {
    // localStorage may be unavailable or full; keep the in-memory cache.
  }
}

export function deleteSuggestedAnswerCache(
  userId: string,
  interviewId: string,
  questionId: string,
): void {
  cache.delete(suggestedAnswerCacheKey(userId, interviewId, questionId));

  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(suggestedAnswerStorageKey(userId, interviewId, questionId));
  } catch {
    // localStorage unavailable
  }
}
