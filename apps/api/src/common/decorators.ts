import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permissions';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
/** Route needs no authentication. A valid session, if present, is still attached. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** User must hold ALL listed permissions (through any of their roles). */
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const SKIP_CSRF = 'skipCsrf';
/** Exempt from the CSRF header check (server-to-server endpoints such as webhooks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user;
});
