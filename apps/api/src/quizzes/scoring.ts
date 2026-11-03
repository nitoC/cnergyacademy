/**
 * Server-side quiz scoring. The client only ever sends selected option ids;
 * correctness and points are computed here from the stored answer key.
 */
export interface ScorableQuestion {
  id: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  points: number;
  options: { id: string; isCorrect: boolean }[];
}

export interface ScoredAnswer {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface ScoreResult {
  answers: ScoredAnswer[];
  pointsEarned: number;
  pointsTotal: number;
  scorePercent: number;
  passed: boolean;
}

export function scoreAttempt(
  questions: ScorableQuestion[],
  submitted: Record<string, string[]>,
  passingScore: number,
): ScoreResult {
  let pointsEarned = 0;
  let pointsTotal = 0;
  const answers = questions.map((q) => {
    pointsTotal += q.points;
    const validIds = new Set(q.options.map((o) => o.id));
    // Ignore ids that do not belong to this question.
    const selected = [...new Set(submitted[q.id] ?? [])].filter((id) => validIds.has(id));
    const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    const singleOk = q.type === 'SINGLE_CHOICE' ? selected.length === 1 : true;
    const isCorrect = singleOk && selected.length === correct.size && selected.every((id) => correct.has(id));
    const pointsAwarded = isCorrect ? q.points : 0;
    pointsEarned += pointsAwarded;
    return { questionId: q.id, selectedOptionIds: selected, isCorrect, pointsAwarded };
  });
  const scorePercent = pointsTotal === 0 ? 0 : Math.round((pointsEarned / pointsTotal) * 100);
  return { answers, pointsEarned, pointsTotal, scorePercent, passed: pointsTotal > 0 && scorePercent >= passingScore };
}
