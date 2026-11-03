import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Journey } from '@/types/api';
import { WindingJourney } from './WindingJourney';

const decision = { granted: true, reason: 'ACCESS_GRANTED' as const, requiresPurchase: false, requiresPrerequisite: false, prerequisiteQuizId: null, preview: false };
const progress = { moduleId: 'm', lessonsTotal: 1, lessonsCompleted: 0, quizzesTotal: 0, quizzesPassed: 0, completed: false };
const journey = {
  course: { id: 'c', title: 'Course', slug: 'c', shortDescription: '', approvedPrice: 100, currency: 'NGN', coverPattern: null, subject: { name: 'S', accentColor: null }, creator: { fullName: 'A' } },
  enrolled: true,
  preview: false,
  hasEntitlement: false,
  isPaidCourse: true,
  progress: { courseId: 'c', percent: 50, itemsTotal: 2, itemsCompleted: 1, lessonsTotal: 2, lessonsCompleted: 1, quizzesTotal: 0, quizzesPassed: 0, isComplete: false, nextLessonId: 'l1', modules: [] },
  courseQuizzes: [],
  certificate: null,
  modules: [
    { id: 'm1', title: 'Basics', summary: null, position: 1, access: 'FREE', isPublished: true, state: 'CURRENT', decision, prerequisiteQuiz: null, progress, checkpoints: [{ kind: 'lesson', id: 'l1', title: 'First lesson', state: 'CURRENT', estimatedMinutes: 5 }] },
    { id: 'm2', title: 'Premium part', summary: null, position: 2, access: 'PREMIUM', isPublished: true, state: 'LOCKED_PREMIUM', decision: { ...decision, granted: false, reason: 'PURCHASE_REQUIRED' as const, requiresPurchase: true }, prerequisiteQuiz: null, progress, checkpoints: [{ kind: 'lesson', id: 'l2', title: 'Locked lesson', state: 'LOCKED_PREMIUM', estimatedMinutes: 5 }] },
  ],
} satisfies Journey;

describe('WindingJourney', () => {
  it('renders every checkpoint as an accessible button with its server state', () => {
    render(<WindingJourney journey={journey} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /Lesson: First lesson\. Up next/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lesson: Locked lesson\. Premium/ })).toBeInTheDocument();
    expect(screen.getByText('You are here')).toBeInTheDocument();
  });

  it('reports the selected checkpoint', async () => {
    const onSelect = vi.fn();
    render(<WindingJourney journey={journey} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Locked lesson/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'checkpoint', checkpoint: expect.objectContaining({ id: 'l2', state: 'LOCKED_PREMIUM' }) }));
  });
});
