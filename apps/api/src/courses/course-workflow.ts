import type { CourseStatus } from '@prisma/client';

/**
 * Course status machine. Transitions not listed here are rejected by the
 * API regardless of who asks.
 */
export type CourseAction = 'submit' | 'withdraw' | 'approve' | 'reject' | 'publish' | 'unpublish' | 'archive' | 'restore';
export type Actor = 'owner' | 'admin';

interface Transition {
  from: CourseStatus[];
  to: CourseStatus;
  actors: Actor[];
}

export const COURSE_TRANSITIONS: Record<CourseAction, Transition> = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'SUBMITTED', actors: ['owner'] },
  withdraw: { from: ['SUBMITTED'], to: 'DRAFT', actors: ['owner'] },
  approve: { from: ['SUBMITTED'], to: 'APPROVED', actors: ['admin'] },
  reject: { from: ['SUBMITTED'], to: 'REJECTED', actors: ['admin'] },
  publish: { from: ['APPROVED'], to: 'PUBLISHED', actors: ['owner', 'admin'] },
  unpublish: { from: ['PUBLISHED'], to: 'APPROVED', actors: ['admin'] },
  archive: { from: ['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED'], to: 'ARCHIVED', actors: ['owner', 'admin'] },
  restore: { from: ['ARCHIVED'], to: 'DRAFT', actors: ['owner', 'admin'] },
};

export function resolveTransition(
  action: CourseAction,
  current: CourseStatus,
  actors: Actor[],
): { ok: true; to: CourseStatus } | { ok: false; reason: 'INVALID_TRANSITION' | 'NOT_PERMITTED' } {
  const t = COURSE_TRANSITIONS[action];
  if (!t.from.includes(current)) return { ok: false, reason: 'INVALID_TRANSITION' };
  if (!t.actors.some((a) => actors.includes(a))) return { ok: false, reason: 'NOT_PERMITTED' };
  return { ok: true, to: t.to };
}

/** Content is frozen while an administrator is reviewing it, and once archived. */
export function isContentEditable(status: CourseStatus): boolean {
  return status !== 'SUBMITTED' && status !== 'ARCHIVED';
}
