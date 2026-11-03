import { computeProgress, CourseStructure } from './progress.service';

const structure = (rule: CourseStructure['completionRule']): CourseStructure => ({
  courseId: 'c',
  completionRule: rule,
  certificateEnabled: true,
  courseQuizzes: [],
  modules: [
    { id: 'm1', title: '', summary: null, position: 1, access: 'FREE', isPublished: true, prerequisiteQuizId: null, lessons: [{ id: 'l1', title: '', position: 1, estimatedMinutes: 5 }, { id: 'l2', title: '', position: 2, estimatedMinutes: 5 }], quizzes: [{ id: 'q1', title: '', lessonId: null, passingScore: 70 }] },
    { id: 'm2', title: '', summary: null, position: 2, access: 'PREMIUM', isPublished: true, prerequisiteQuizId: 'q1', lessons: [{ id: 'l3', title: '', position: 1, estimatedMinutes: 5 }], quizzes: [] },
  ],
});

describe('computeProgress', () => {
  it('counts quizzes only when the completion rule requires them', () => {
    const withQuizzes = computeProgress(structure('ALL_LESSONS_AND_QUIZZES'), new Set(['l1', 'l2', 'l3']), new Set(), null);
    expect(withQuizzes).toMatchObject({ percent: 75, isComplete: false });
    const lessonsOnly = computeProgress(structure('ALL_LESSONS'), new Set(['l1', 'l2', 'l3']), new Set(), null);
    expect(lessonsOnly).toMatchObject({ percent: 100, isComplete: true });
  });

  it('resumes at the last lesson touched if it is unfinished', () => {
    expect(computeProgress(structure('ALL_LESSONS'), new Set(['l1']), new Set(), 'l2').nextLessonId).toBe('l2');
  });

  it('moves on to the next unfinished lesson after the last one touched', () => {
    expect(computeProgress(structure('ALL_LESSONS'), new Set(['l1', 'l2']), new Set(), 'l2').nextLessonId).toBe('l3');
    expect(computeProgress(structure('ALL_LESSONS'), new Set(['l2', 'l3']), new Set(), 'l3').nextLessonId).toBe('l1');
  });

  it('reports module completion', () => {
    const p = computeProgress(structure('ALL_LESSONS_AND_QUIZZES'), new Set(['l1', 'l2']), new Set(['q1']), null);
    expect(p.modules.map((m) => m.completed)).toEqual([true, false]);
  });

  it('never completes an empty course', () => {
    const empty = { ...structure('ALL_LESSONS'), modules: [] };
    expect(computeProgress(empty, new Set(), new Set(), null).isComplete).toBe(false);
  });
});
