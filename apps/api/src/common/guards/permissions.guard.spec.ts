import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AuthUser } from '../auth-user';
import type { PermissionKey } from '../permissions';
import { ROLE_PERMISSIONS } from '../permissions';

function ctx(user: Partial<AuthUser> | undefined, required: PermissionKey[] | undefined) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), context };
}

const userWith = (...roles: (keyof typeof ROLE_PERMISSIONS)[]): Partial<AuthUser> => ({
  roles,
  permissions: new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r])),
});

describe('PermissionsGuard', () => {
  it('allows routes without requirements', () => {
    const { guard, context } = ctx(undefined, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('enforces permissions from every role a user holds (roles are additive)', () => {
    const { guard, context } = ctx(userWith('LEARNER', 'CREATOR'), ['courses.create', 'courses.learn']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies learners administrative permissions', () => {
    const { guard, context } = ctx(userWith('LEARNER'), ['roles.assign']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('gives mentors support access but not course authoring', () => {
    expect(ROLE_PERMISSIONS.MENTOR).toContain('support.respond');
    const { guard, context } = ctx(userWith('LEARNER', 'MENTOR'), ['courses.create']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
