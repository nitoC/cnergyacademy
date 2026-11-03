import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators';
import type { PermissionKey } from '../permissions';
import type { AuthUser } from '../auth-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not permitted' });
    const missing = required.filter((p) => !user.permissions.has(p));
    if (missing.length) {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You do not have permission to do this' });
    }
    return true;
  }
}
