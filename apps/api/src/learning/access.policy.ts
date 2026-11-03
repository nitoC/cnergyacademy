import type { CourseStatus, ModuleAccess } from '@prisma/client';

/**
 * Single source of truth for module access. Every lesson, quiz and journey
 * request goes through `decideModuleAccess`, so the learner dashboard, the
 * course journey and the content endpoints can never disagree.
 *
 * Purchasing and prerequisites are independent gates:
 *   - an entitlement never bypasses a prerequisite quiz;
 *   - passing a prerequisite quiz never grants premium access.
 */
export type AccessReason =
  | 'ACCESS_GRANTED'
  | 'AUTHENTICATION_REQUIRED'
  | 'PURCHASE_REQUIRED'
  | 'PREREQUISITE_NOT_COMPLETED'
  | 'PURCHASE_AND_PREREQUISITE_REQUIRED'
  | 'COURSE_NOT_PUBLISHED'
  | 'MODULE_NOT_PUBLISHED'
  | 'ACCOUNT_NOT_AUTHORIZED';

export interface AccessFacts {
  authenticated: boolean;
  accountActive: boolean;
  /** Course creator, assigned mentor or reviewing administrator. */
  isStaff: boolean;
  courseStatus: CourseStatus;
  modulePublished: boolean;
  access: ModuleAccess;
  /** Course has an approved price above zero. */
  isPaidCourse: boolean;
  hasEntitlement: boolean;
  prerequisiteQuizId: string | null;
  prerequisitePassed: boolean;
  freeRequiresSignIn: boolean;
}

export interface AccessDecision {
  granted: boolean;
  reason: AccessReason;
  requiresPurchase: boolean;
  requiresPrerequisite: boolean;
  prerequisiteQuizId: string | null;
  preview: boolean;
}

export const PREMIUM_POLICIES: ModuleAccess[] = ['PREMIUM', 'PREMIUM_AND_PREREQUISITE_QUIZ'];
export const PREREQUISITE_POLICIES: ModuleAccess[] = ['PREREQUISITE_QUIZ', 'PREMIUM_AND_PREREQUISITE_QUIZ'];

export function decideModuleAccess(f: AccessFacts): AccessDecision {
  const base = { prerequisiteQuizId: f.prerequisiteQuizId, preview: false };
  const needsPurchase = PREMIUM_POLICIES.includes(f.access) && f.isPaidCourse && !f.hasEntitlement;
  const needsPrerequisite = PREREQUISITE_POLICIES.includes(f.access) && !!f.prerequisiteQuizId && !f.prerequisitePassed;
  const flags = { requiresPurchase: needsPurchase, requiresPrerequisite: needsPrerequisite };

  if (f.isStaff && f.authenticated && f.accountActive) {
    return { granted: true, reason: 'ACCESS_GRANTED', ...flags, ...base, preview: true };
  }
  if (f.courseStatus !== 'PUBLISHED') return { granted: false, reason: 'COURSE_NOT_PUBLISHED', ...flags, ...base };
  if (!f.modulePublished) return { granted: false, reason: 'MODULE_NOT_PUBLISHED', ...flags, ...base };
  if (!f.authenticated) {
    const openToGuests = f.access === 'FREE' && !f.freeRequiresSignIn;
    if (!openToGuests) return { granted: false, reason: 'AUTHENTICATION_REQUIRED', ...flags, ...base };
  } else if (!f.accountActive) {
    return { granted: false, reason: 'ACCOUNT_NOT_AUTHORIZED', ...flags, ...base };
  }
  if (needsPurchase && needsPrerequisite) return { granted: false, reason: 'PURCHASE_AND_PREREQUISITE_REQUIRED', ...flags, ...base };
  if (needsPurchase) return { granted: false, reason: 'PURCHASE_REQUIRED', ...flags, ...base };
  if (needsPrerequisite) return { granted: false, reason: 'PREREQUISITE_NOT_COMPLETED', ...flags, ...base };
  return { granted: true, reason: 'ACCESS_GRANTED', ...flags, ...base };
}
