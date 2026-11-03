import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../../config/configuration';
import { IS_PUBLIC } from '../decorators';
import { ACCESS_COOKIE } from '../cookies';
import type { AuthUser } from '../auth-user';
import type { PermissionKey, RoleKey } from '../permissions';

interface AccessPayload {
  sub: string;
  sid: string;
}

/**
 * Global authentication guard. Verifies the access token (httpOnly cookie
 * or Bearer header) and re-loads the user, roles and permissions from the
 * database on every request so that suspensions and role changes take
 * effect immediately, not when the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue' });
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.config.jwt.accessSecret });
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Session expired' });
    }

    const user = await loadAuthUser(this.prisma, payload.sub, payload.sid);
    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session is no longer valid' });
    }
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'This account is not active' });
    }
    req.user = user;
    // Fire-and-forget activity stamp, throttled to once per 5 minutes.
    void this.prisma.user
      .updateMany({
        where: { id: user.id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(Date.now() - 5 * 60_000) } }] },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => undefined);
    return true;
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
}

export async function loadAuthUser(prisma: PrismaService, userId: string, sessionId?: string): Promise<AuthUser | null> {
  if (sessionId) {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, userId: true } });
    // A rotated session is still valid for its outstanding access token; only revocation ends it.
    if (!session || session.revokedAt || session.userId !== userId) return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      emailVerifiedAt: true,
      roles: { select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  if (!user) return null;
  const permissions = new Set<PermissionKey>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    roles: user.roles.map((r) => r.role.key as RoleKey),
    permissions,
  };
}
