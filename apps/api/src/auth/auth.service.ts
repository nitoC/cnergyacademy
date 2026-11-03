import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { UserTokenType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit-logs/audit.service';
import { randomToken, sha256 } from '../common/util';
import { loadAuthUser } from '../common/guards/jwt-auth.guard';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
}

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  // Verify against a real hash when the email is unknown so response time
  // does not reveal whether an account exists.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { ...ARGON_OPTS, raw: false });
  }

  async register(dto: RegisterDto, client: ClientInfo) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({ code: 'EMAIL_IN_USE', message: 'An account with this email already exists' });
    }
    const learnerRole = await this.prisma.role.findUniqueOrThrow({ where: { key: 'LEARNER' } });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: await this.hashPassword(dto.password),
        // Self-registration only ever grants LEARNER. Privileged roles are
        // assigned by administrators or through creator approval.
        roles: { create: { roleId: learnerRole.id } },
      },
    });
    await this.sendVerification(user.id, user.email, user.fullName);
    await this.audit.record({ actorId: user.id, action: 'auth.register', resourceType: 'User', resourceId: user.id, ipAddress: client.ip });
    return this.issueSession(user.id, client);
  }

  async login(dto: LoginDto, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    this.dummyHash ??= this.hashPassword(randomToken(16));
    const valid = await argon2.verify(user?.passwordHash ?? (await this.dummyHash)!, dto.password).catch(() => false);
    if (!user || !valid) {
      await this.audit.record({ action: 'auth.login', resourceType: 'User', resourceId: user?.id, outcome: 'DENIED', ipAddress: client.ip, metadata: { email: dto.email } });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'This account is not active. Contact support.' });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } });
    return this.issueSession(user.id, client);
  }

  /** Creates a new session family with a fresh refresh token. */
  async issueSession(userId: string, client: ClientInfo, familyId: string = randomUUID()): Promise<IssuedSession> {
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: client.ip?.slice(0, 64),
        userAgent: client.userAgent?.slice(0, 255),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id },
      { secret: this.config.jwt.accessSecret, expiresIn: this.config.jwt.accessTtlSeconds },
    );
    return { accessToken, refreshToken, refreshExpiresAt, userId };
  }

  /**
   * Refresh-token rotation with reuse detection. A token can be exchanged
   * exactly once; presenting a rotated token revokes the whole family
   * because it indicates the token was stolen.
   */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!refreshToken) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue' });
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!session) throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session is no longer valid' });

    if (session.rotatedAt || session.revokedAt) {
      // Small grace window for concurrent refreshes from the same browser.
      const graceMs = 10_000;
      if (session.rotatedAt && !session.revokedAt && Date.now() - session.rotatedAt.getTime() < graceMs) {
        throw new UnauthorizedException({ code: 'REFRESH_RACE', message: 'Session refreshed elsewhere; retry' });
      }
      await this.prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorId: session.userId, action: 'auth.refresh_reuse', resourceType: 'Session', resourceId: session.id, outcome: 'DENIED', ipAddress: client.ip });
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session is no longer valid' });
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'This account is not active' });
    }
    // Atomic claim so two concurrent refreshes cannot both rotate.
    const claimed = await this.prisma.session.updateMany({ where: { id: session.id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: new Date() } });
    if (claimed.count === 0) throw new UnauthorizedException({ code: 'REFRESH_RACE', message: 'Session refreshed elsewhere; retry' });
    return this.issueSession(session.userId, client, session.familyId);
  }

  async logout(refreshToken: string | undefined, accessSessionUserId?: string) {
    if (refreshToken) {
      const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
      if (session) {
        await this.prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    if (accessSessionUserId) {
      this.logger.log({ msg: 'logout', userId: accessSessionUserId });
    }
  }

  async logoutAll(userId: string) {
    const r = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorId: userId, action: 'auth.logout_all', resourceType: 'User', resourceId: userId, metadata: { sessions: r.count } });
    return { revoked: r.count };
  }

  async me(userId: string) {
    const auth = await loadAuthUser(this.prisma, userId);
    if (!auth) throw new UnauthorizedException();
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, bio: true, avatarUrl: true, createdAt: true },
    });
    const pendingApplication = await this.prisma.creatorApplication.findFirst({
      where: { userId, status: 'PENDING' },
      select: { id: true, createdAt: true },
    });
    return {
      id: auth.id,
      email: auth.email,
      fullName: auth.fullName,
      status: auth.status,
      emailVerified: auth.emailVerified,
      roles: auth.roles,
      permissions: [...auth.permissions].sort(),
      ...profile,
      pendingCreatorApplication: pendingApplication,
    };
  }

  // ─── Email verification & password reset ───

  private async createToken(userId: string, type: UserTokenType, ttlMinutes: number) {
    const token = randomToken(32);
    await this.prisma.userToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.userToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) },
    });
    return token;
  }

  private async consumeToken(token: string, type: UserTokenType) {
    const record = await this.prisma.userToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'This link is invalid or has expired' });
    }
    const claimed = await this.prisma.userToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'This link has already been used' });
    return record;
  }

  async sendVerification(userId: string, email: string, fullName: string) {
    const token = await this.createToken(userId, 'EMAIL_VERIFICATION', 60 * 24);
    const link = `${this.config.webUrl}/verify-email?token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Confirm your email address',
      template: 'verify-email',
      text: `Hello ${fullName},\n\nConfirm your email address: ${link}\n\nThis link expires in 24 hours.`,
      data: { link, token },
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { alreadyVerified: true };
    await this.sendVerification(user.id, user.email, user.fullName);
    return { sent: true };
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, 'EMAIL_VERIFICATION');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date(), ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}) },
    });
    return { verified: true };
  }

  /** Always succeeds from the caller's perspective to avoid account enumeration. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status !== 'DEACTIVATED') {
      const token = await this.createToken(user.id, 'PASSWORD_RESET', 30);
      const link = `${this.config.webUrl}/reset-password?token=${token}`;
      await this.mail.send({
        to: user.email,
        subject: 'Reset your password',
        template: 'reset-password',
        text: `Hello ${user.fullName},\n\nReset your password: ${link}\n\nThis link expires in 30 minutes. If you did not ask for this, ignore this email.`,
        data: { link, token },
      });
    }
    return { sent: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeToken(token, 'PASSWORD_RESET');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await this.hashPassword(password) } }),
      // Invalidate every existing session after a reset.
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record({ actorId: record.userId, action: 'auth.password_reset', resourceType: 'User', resourceId: record.userId });
    return { reset: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, currentRefreshToken?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false))) {
      throw new BadRequestException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' });
    }
    const keepFamily = currentRefreshToken
      ? (await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(currentRefreshToken) } }))?.familyId
      : undefined;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hashPassword(dto.newPassword) } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, ...(keepFamily ? { NOT: { familyId: keepFamily } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({ actorId: userId, action: 'auth.password_change', resourceType: 'User', resourceId: userId });
    return { changed: true };
  }
}
