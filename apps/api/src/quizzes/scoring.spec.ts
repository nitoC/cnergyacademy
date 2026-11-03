import { scoreAttempt, ScorableQuestion } from './scoring';

const q = (id: string, correct: string[], all: string[], type: ScorableQuestion['type'] = 'SINGLE_CHOICE', points = 1): ScorableQuestion => ({
  id,
  type,
  points,
  options: all.map((o) => ({ id: o, isCorrect: correct.includes(o) })),
});

describe('scoreAttempt', () => {
  const questions = [q('q1', ['a'], ['a', 'b']), q('q2', ['c', 'd'], ['c', 'd', 'e'], 'MULTIPLE_CHOICE', 2), q('q3', ['f'], ['f', 'g'])];

  it('scores correct answers and computes percent', () => {
    const r = scoreAttempt(questions, { q1: ['a'], q2: ['c', 'd'], q3: ['g'] }, 70);
    expect(r).toMatchObject({ pointsEarned: 3, pointsTotal: 4, scorePercent: 75, passed: true });
  });

  it('requires the exact set for multiple choice', () => {
    expect(scoreAttempt(questions, { q2: ['c'] }, 70).answers[1].isCorrect).toBe(false);
    expect(scoreAttempt(questions, { q2: ['c', 'd', 'e'] }, 70).answers[1].isCorrect).toBe(false);
  });

  it('rejects multiple selections on single choice', () => {
    expect(scoreAttempt(questions, { q1: ['a', 'b'] }, 70).answers[0].isCorrect).toBe(false);
  });

  it('ignores option ids from other questions (no answer smuggling)', () => {
    const r = scoreAttempt(questions, { q1: ['c'], q3: ['a', 'f'] }, 70);
    expect(r.answers[0].selectedOptionIds).toEqual([]);
    expect(r.answers[2]).toMatchObject({ selectedOptionIds: ['f'], isCorrect: true });
  });

  it('treats unanswered questions as wrong and applies the pass mark', () => {
    const r = scoreAttempt(questions, {}, 1);
    expect(r).toMatchObject({ pointsEarned: 0, scorePercent: 0, passed: false });
  });

  it('never passes an empty quiz', () => {
    expect(scoreAttempt([], {}, 0).passed).toBe(false);
  });
});
