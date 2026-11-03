import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, skipTake } from '../common/pagination';
import type { AuthUser } from '../common/auth-user';
import type { RoleKey } from '../common/permissions';
import type {
  AdminUserQueryDto,
  ApplicationQueryDto,
  AssignRolesDto,
  CreatorApplicationDto,
  ReviewApplicationDto,
  UpdateProfileDto,
  UpdateStatusDto,
} from './users.dto';

const PUBLIC_USER = { id: true, fullName: true, displayName: true, avatarUrl: true, bio: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  updateProfile(userId: string, dto: UpdateProfileDto) {
    // Explicit field list: protects against mass assignment of status/roles/email.
    return this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, displayName: dto.displayName, bio: dto.bio, avatarUrl: dto.avatarUrl },
      select: { ...PUBLIC_USER, email: true },
    });
  }

  publicProfile(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: PUBLIC_USER });
  }

  // ─── Administration ───

  async list(q: AdminUserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
      ...(q.search
        ? { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { fullName: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...skipTake(q),
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          emailVerifiedAt: true,
          lastActiveAt: true,
          createdAt: true,
          roles: { select: { role: { select: { key: true } } } },
          _count: { select: { enrollments: true, courses: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(
      items.map(({ roles, ...u }) => ({ ...u, roles: roles.map((r) => r.role.key) })),
      total,
      q,
    );
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        displayName: true,
        bio: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        roles: { select: { grantedAt: true, role: { select: { key: true, name: true } }, grantedBy: { select: { fullName: true } } } },
        _count: { select: { enrollments: true, courses: true, certificates: true, transactions: true, supportThreads: true } },
      },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    const [enrollments, transactions, activity, applications] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where: { userId: id },
        orderBy: { lastActivityAt: 'desc' },
        take: 10,
        select: { enrolledAt: true, completedAt: true, lastActivityAt: true, course: { select: { id: true, title: true } } },
      }),
      this.prisma.paymentTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reference: true, amount: true, currency: true, status: true, createdAt: true, course: { select: { title: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ actorId: id }, { resourceType: 'User', resourceId: id }] },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, outcome: true, createdAt: true, actor: { select: { fullName: true } }, metadata: true },
      }),
      this.prisma.creatorApplication.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { ...user, enrollments, transactions, activity, applications };
  }

  async assignRoles(actor: AuthUser, userId: string, dto: AssignRolesDto, ip?: string) {
    if (actor.id === userId) {
      throw new ForbiddenException({ code: 'SELF_ROLE_CHANGE', message: 'You cannot change your own roles' });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    const desired = new Set<RoleKey>(dto.roles);
    desired.add('LEARNER'); // every account keeps the base role
    const current = new Set(target.roles.map((r) => r.role.key as RoleKey));
    const add = [...desired].filter((r) => !current.has(r));
    const remove = [...current].filter((r) => !desired.has(r));
    if (!add.length && !remove.length) return { roles: [...current] };

    if (remove.includes('ADMIN')) {
      const admins = await this.prisma.userRole.count({ where: { role: { key: 'ADMIN' }, user: { status: 'ACTIVE' } } });
      if (admins <= 1) throw new BadRequestException({ code: 'LAST_ADMIN', message: 'At least one active administrator must remain' });
    }
    const roles = await this.prisma.role.findMany({ where: { key: { in: [...add, ...remove] } } });
    const idOf = (k: string) => roles.find((r) => r.key === k)!.id;

    await this.prisma.$transaction(async (tx) => {
      if (add.length) {
        await tx.userRole.createMany({ data: add.map((k) => ({ userId, roleId: idOf(k), grantedById: actor.id })), skipDuplicates: true });
      }
      if (remove.length) {
        await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove.map(idOf) } } });
      }
      await this.audit.record(
        { actorId: actor.id, action: 'user.roles.update', resourceType: 'User', resourceId: userId, ipAddress: ip, metadata: { added: add, removed: remove, reason: dto.reason } },
        tx,
      );
    });
    return { roles: [...desired] };
  }

  async updateStatus(actor: AuthUser, userId: string, dto: UpdateStatusDto, ip?: string) {
    if (actor.id === userId) throw new ForbiddenException({ code: 'SELF_STATUS_CHANGE', message: 'You cannot change your own account status' });
    const target = await this.prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    if (target.status === dto.status) return { status: target.status };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: dto.status } });
      if (dto.status === 'SUSPENDED' || dto.status === 'DEACTIVATED') {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: dto.status === 'SUSPENDED' ? 'user.suspend' : 'user.status.update',
          resourceType: 'User',
          resourceId: userId,
          ipAddress: ip,
          metadata: { from: target.status, to: dto.status, reason: dto.reason },
        },
        tx,
      );
    });
    return { status: dto.status };
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { key: 'asc' },
      include: { permissions: { select: { permission: { select: { key: true, description: true } } } }, _count: { select: { users: true } } },
    });
  }

  // ─── Creator applications ───

  async apply(user: AuthUser, dto: CreatorApplicationDto) {
    if (user.roles.includes('CREATOR')) throw new ConflictException({ code: 'ALREADY_CREATOR', message: 'You are already a creator' });
    if (!user.emailVerified) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before applying' });
    const pending = await this.prisma.creatorApplication.findFirst({ where: { userId: user.id, status: 'PENDING' } });
    if (pending) throw new ConflictException({ code: 'APPLICATION_PENDING', message: 'You already have an application under review' });
    const app = await this.prisma.creatorApplication.create({
      data: { userId: user.id, headline: dto.headline, expertise: dto.expertise, portfolioUrl: dto.portfolioUrl, motivation: dto.motivation },
    });
    const admins = await this.prisma.userRole.findMany({ where: { role: { key: 'ADMIN' } }, select: { userId: true } });
    await this.notifications.notify(admins.map((a) => a.userId), {
      type: 'creator.application',
      title: `New creator application from ${user.fullName}`,
      link: '/admin/creators',
    });
    return app;
  }

  myApplications(userId: string) {
    return this.prisma.creatorApplication.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async listApplications(q: ApplicationQueryDto) {
    const where: Prisma.CreatorApplicationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { user: { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.creatorApplication.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...skipTake(q),
        include: { user: { select: { id: true, fullName: true, email: true, createdAt: true } }, reviewer: { select: { fullName: true } } },
      }),
      this.prisma.creatorApplication.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async reviewApplication(actor: AuthUser, id: string, dto: ReviewApplicationDto, ip?: string) {
    const app = await this.prisma.creatorApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found' });
    if (app.status !== 'PENDING') throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'This application has already been reviewed' });
    if (app.userId === actor.id) throw new ForbiddenException({ code: 'SELF_REVIEW', message: 'You cannot review your own application' });
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) {
      throw new BadRequestException({ code: 'FEEDBACK_REQUIRED', message: 'Give the applicant a reason' });
    }
    const creatorRole = await this.prisma.role.findUniqueOrThrow({ where: { key: 'CREATOR' } });
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creatorApplication.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: dto.decision, reviewerId: actor.id, reviewNote: dto.note, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'This application has already been reviewed' });
      if (dto.decision === 'APPROVED') {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: app.userId, roleId: creatorRole.id } },
          create: { userId: app.userId, roleId: creatorRole.id, grantedById: actor.id },
          update: {},
        });
      }
      await this.audit.record(
        { actorId: actor.id, action: `creator.application.${dto.decision.toLowerCase()}`, resourceType: 'CreatorApplication', resourceId: id, ipAddress: ip, metadata: { userId: app.userId, note: dto.note } },
        tx,
      );
      await this.notifications.notify(
        app.userId,
        {
          type: 'creator.application',
          title: dto.decision === 'APPROVED' ? 'Your creator application was approved' : 'Your creator application was not approved',
          body: dto.note,
          link: dto.decision === 'APPROVED' ? '/creator' : '/become-a-creator',
        },
        tx,
      );
    });
    return { status: dto.decision };
  }

  async creatorOverview(q: { page: number; pageSize: number; search?: string }) {
    const where: Prisma.UserWhereInput = {
      roles: { some: { role: { key: 'CREATOR' } } },
      ...(q.search ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        ...skipTake(q),
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          courses: { select: { id: true, title: true, status: true, _count: { select: { enrollments: true } } }, orderBy: { updatedAt: 'desc' } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, q);
  }
}
