export function normalizeTranscriptForCommit(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function shouldCommitTranscript(previous: string, next: string): boolean {
  const normalizedNext = normalizeTranscriptForCommit(next);
  if (!normalizedNext) return false;
  return normalizedNext !== normalizeTranscriptForCommit(previous);
}
