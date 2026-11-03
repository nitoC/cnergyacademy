import { isContentEditable, resolveTransition } from './course-workflow';

describe('course workflow', () => {
  it('lets owners submit drafts and resubmit rejected courses', () => {
    expect(resolveTransition('submit', 'DRAFT', ['owner'])).toEqual({ ok: true, to: 'SUBMITTED' });
    expect(resolveTransition('submit', 'REJECTED', ['owner'])).toEqual({ ok: true, to: 'SUBMITTED' });
  });

  it('reserves approval and rejection for administrators', () => {
    expect(resolveTransition('approve', 'SUBMITTED', ['owner'])).toEqual({ ok: false, reason: 'NOT_PERMITTED' });
    expect(resolveTransition('approve', 'SUBMITTED', ['admin'])).toEqual({ ok: true, to: 'APPROVED' });
    expect(resolveTransition('reject', 'SUBMITTED', ['admin'])).toEqual({ ok: true, to: 'REJECTED' });
  });

  it('rejects transitions from the wrong state', () => {
    expect(resolveTransition('publish', 'DRAFT', ['admin'])).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(resolveTransition('approve', 'PUBLISHED', ['admin'])).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });

  it('allows owners or admins to publish an approved course', () => {
    expect(resolveTransition('publish', 'APPROVED', ['owner'])).toEqual({ ok: true, to: 'PUBLISHED' });
    expect(resolveTransition('unpublish', 'PUBLISHED', ['owner'])).toEqual({ ok: false, reason: 'NOT_PERMITTED' });
  });

  it('freezes content during review and once archived', () => {
    expect(isContentEditable('SUBMITTED')).toBe(false);
    expect(isContentEditable('ARCHIVED')).toBe(false);
    expect(isContentEditable('PUBLISHED')).toBe(true);
  });
});
