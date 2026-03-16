type ScoreEntry = { score?: number | string | null } | null | undefined;

export type SessionScoreInsights =
  | {
      questionEvaluations?: ScoreEntry[] | null;
      criteriaEvaluations?: ScoreEntry[] | null;
    }
  | null
  | undefined;

function averageScore(entries: ScoreEntry[] | null | undefined): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const scores = entries
    .map((entry) => {
      if (!entry || entry.score == null) return null;
      return typeof entry.score === "number"
        ? entry.score
        : Number(entry.score);
    })
    .filter((score): score is number => Number.isFinite(score));
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function getSessionOverallScore(
  insights: SessionScoreInsights,
): number | null {
  const questionScore = averageScore(insights?.questionEvaluations);
  if (questionScore !== null) return questionScore;
  return averageScore(insights?.criteriaEvaluations);
}

export function usesQuestionEvaluationScore(
  insights: SessionScoreInsights,
): boolean {
  return averageScore(insights?.questionEvaluations) !== null;
}
