import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportThread, ThreadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, PaginationQueryDto, skipTake } from '../common/pagination';
import type { AuthUser } from '../common/auth-user';
import type { AssignMentorDto, CreateThreadDto, MentorAssignmentDto, MessagesQueryDto, ThreadQueryDto } from './mentorship.dto';

type Role = 'learner' | 'responder' | 'overseer';

@Injectable()
export class MentorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every course id the user may answer questions for (own courses + active assignments). */
  private async responderCourseIds(user: AuthUser): Promise<string[]> {
    if (!user.permissions.has('support.respond')) return [];
    const [own, assigned] = await Promise.all([
      this.prisma.course.findMany({ where: { creatorId: user.id }, select: { id: true } }),
      this.prisma.mentorAssignment.findMany({ where: { mentorId: user.id, active: true }, select: { courseId: true } }),
    ]);
    return [...new Set([...own.map((c) => c.id), ...assigned.map((a) => a.courseId)])];
  }

  private async roleIn(user: AuthUser, thread: SupportThread & { course: { creatorId: string } }): Promise<Role | null> {
    if (thread.learnerId === user.id) return 'learner';
    if (thread.mentorId === user.id || thread.course.creatorId === user.id) return 'responder';
    if (user.permissions.has('support.respond')) {
      const a = await this.prisma.mentorAssignment.findFirst({ where: { mentorId: user.id, courseId: thread.courseId, active: true } });
      if (a) return 'responder';
    }
    if (user.permissions.has('support.oversee')) return 'overseer';
    return null;
  }

  private async authorised(user: AuthUser, threadId: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id: threadId }, include: { course: { select: { creatorId: true, title: true } } } });
    if (!thread) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    const role = await this.roleIn(user, thread);
    // Same 404 for "missing" and "not yours" so ids cannot be probed.
    if (!role) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    return { thread, role };
  }

  async create(user: AuthUser, dto: CreateThreadDto) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: dto.courseId } } });
    if (!enrollment) throw new ForbiddenException({ code: 'NOT_ENROLLED', message: 'Enrol in the course to ask its mentors a question' });
    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({ where: { id: dto.lessonId }, include: { module: true } });
      if (!lesson || lesson.module.courseId !== dto.courseId) throw new BadRequestException({ code: 'INVALID_LESSON', message: 'Lesson does not belong to this course' });
    }
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: dto.courseId }, select: { id: true, title: true, creatorId: true } });
    // Auto-assign the active mentor with the lightest open load.
    const mentors = await this.prisma.mentorAssignment.findMany({
      where: { courseId: dto.courseId, active: true, mentor: { status: 'ACTIVE' } },
      select: { mentorId: true, mentor: { select: { _count: { select: { mentoredThreads: { where: { status: { not: 'RESOLVED' } } } } } } } },
    });
    const mentorId = mentors.sort((a, b) => a.mentor._count.mentoredThreads - b.mentor._count.mentoredThreads)[0]?.mentorId ?? null;
    const thread = await this.prisma.$transaction(async (tx) => {
      const t = await tx.supportThread.create({
        data: {
          learnerId: user.id,
          courseId: dto.courseId,
          lessonId: dto.lessonId,
          subject: dto.subject,
          mentorId,
          status: 'WAITING_FOR_RESPONSE',
          messages: { create: { authorId: user.id, body: dto.body } },
          reads: { create: { userId: user.id } },
        },
      });
      await this.notifications.notify(
        [mentorId ?? course.creatorId],
        { type: 'support.message', title: `New question in ${course.title}`, body: dto.subject, link: `/support/${t.id}` },
        tx,
      );
      return t;
    });
    return thread;
  }

  async list(user: AuthUser, q: ThreadQueryDto) {
    let where: Prisma.SupportThreadWhereInput;
    if (q.scope === 'all') {
      if (!user.permissions.has('support.oversee')) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not permitted' });
      where = {};
    } else if (q.scope === 'inbox') {
      const courseIds = await this.responderCourseIds(user);
      where = { OR: [{ courseId: { in: courseIds } }, { mentorId: user.id }] };
    } else {
      where = { learnerId: user.id };
    }
    where = {
      AND: [
        where,
        q.status ? { status: q.status } : {},
        q.courseId ? { courseId: q.courseId } : {},
        q.unassigned === 'true' ? { mentorId: null } : {},
        q.search ? { OR: [{ subject: { contains: q.search, mode: 'insensitive' } }, { learner: { fullName: { contains: q.search, mode: 'insensitive' } } }] } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        ...skipTake(q),
        include: {
          course: { select: { id: true, title: true } },
          lesson: { select: { id: true, title: true } },
          learner: { select: { id: true, fullName: true } },
          mentor: { select: { id: true, fullName: true } },
          reads: { where: { userId: user.id }, select: { lastReadAt: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, authorId: true } },
        },
      }),
      this.prisma.supportThread.count({ where }),
    ]);
    return paginate(
      items.map(({ reads, messages, ...t }) => ({
        ...t,
        lastMessage: messages[0] ? { ...messages[0], body: messages[0].body.slice(0, 160) } : null,
        unread: !reads[0] || reads[0].lastReadAt < t.lastMessageAt,
      })),
      total,
      q,
    );
  }

  async unreadCount(user: AuthUser) {
    const courseIds = await this.responderCourseIds(user);
    const threads = await this.prisma.supportThread.findMany({
      where: { OR: [{ learnerId: user.id }, { mentorId: user.id }, { courseId: { in: courseIds } }], status: { not: 'RESOLVED' } },
      select: { lastMessageAt: true, reads: { where: { userId: user.id }, select: { lastReadAt: true } } },
    });
    return { unread: threads.filter((t) => !t.reads[0] || t.reads[0].lastReadAt < t.lastMessageAt).length };
  }

  async detail(user: AuthUser, id: string) {
    const { role } = await this.authorised(user, id);
    const thread = await this.prisma.supportThread.findUniqueOrThrow({
      where: { id },
      include: {
        course: { select: { id: true, title: true, slug: true, creator: { select: { id: true, fullName: true } } } },
        lesson: { select: { id: true, title: true } },
        learner: { select: { id: true, fullName: true } },
        mentor: { select: { id: true, fullName: true } },
      },
    });
    const mentors = role !== 'learner'
      ? await this.prisma.mentorAssignment.findMany({ where: { courseId: thread.courseId, active: true }, select: { mentor: { select: { id: true, fullName: true } } } })
      : [];
    return { ...thread, viewerRole: role, availableMentors: mentors.map((m) => m.mentor) };
  }

  /** Cursor pagination, newest first; the client reverses for display. */
  async messages(user: AuthUser, id: string, q: MessagesQueryDto) {
    await this.authorised(user, id);
    const items = await this.prisma.supportMessage.findMany({
      where: { threadId: id, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      include: { author: { select: { id: true, fullName: true, roles: { select: { role: { select: { key: true } } } } } } },
    });
    const hasMore = items.length > q.limit;
    const page = items.slice(0, q.limit).map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, author: { id: m.author.id, fullName: m.author.fullName, roles: m.author.roles.map((r) => r.role.key) } }));
    return { items: page, hasMore, nextCursor: hasMore ? page[page.length - 1].createdAt : null };
  }

  async post(user: AuthUser, id: string, body: string) {
    const { thread, role } = await this.authorised(user, id);
    if (role === 'overseer' && !user.permissions.has('support.respond')) {
      throw new ForbiddenException({ code: 'READ_ONLY', message: 'Oversight access is read-only' });
    }
    const status: ThreadStatus = role === 'learner' ? 'WAITING_FOR_RESPONSE' : 'ANSWERED';
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({ data: { threadId: id, authorId: user.id, body } });
      await tx.supportThread.update({
        where: { id },
        data: { status, lastMessageAt: now, resolvedAt: null, ...(role !== 'learner' && !thread.mentorId && thread.course.creatorId !== user.id ? { mentorId: user.id } : {}) },
      });
      await tx.supportThreadRead.upsert({ where: { threadId_userId: { threadId: id, userId: user.id } }, create: { threadId: id, userId: user.id, lastReadAt: now }, update: { lastReadAt: now } });
      const recipients = role === 'learner' ? [thread.mentorId ?? thread.course.creatorId] : [thread.learnerId];
      await this.notifications.notify(
        recipients.filter((r) => r !== user.id),
        { type: 'support.message', title: role === 'learner' ? `Reply from ${user.fullName}` : `${user.fullName} answered your question`, body: thread.subject, link: `/support/${id}` },
        tx,
      );
      return message;
    });
  }

  async markRead(user: AuthUser, id: string) {
    await this.authorised(user, id);
    await this.prisma.supportThreadRead.upsert({
      where: { threadId_userId: { threadId: id, userId: user.id } },
      create: { threadId: id, userId: user.id },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async setStatus(user: AuthUser, id: string, action: 'resolve' | 'reopen') {
    const { thread, role } = await this.authorised(user, id);
    if (role === 'overseer' && !user.permissions.has('support.oversee')) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not permitted' });
    if (action === 'resolve') {
      if (thread.status === 'RESOLVED') return thread;
      return this.prisma.supportThread.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    }
    if (thread.status !== 'RESOLVED') throw new ConflictException({ code: 'NOT_RESOLVED', message: 'This conversation is already open' });
    return this.prisma.supportThread.update({ where: { id }, data: { status: role === 'learner' ? 'WAITING_FOR_RESPONSE' : 'OPEN', resolvedAt: null } });
  }

  async assignMentor(user: AuthUser, id: string, dto: AssignMentorDto, ip?: string) {
    const { thread } = await this.authorised(user, id);
    const canAssign = user.permissions.has('mentors.manage') || user.permissions.has('support.oversee') || thread.course.creatorId === user.id;
    if (!canAssign) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Only the course creator or an administrator can assign mentors' });
    if (dto.mentorId) {
      const assignment = await this.prisma.mentorAssignment.findFirst({ where: { mentorId: dto.mentorId, courseId: thread.courseId, active: true } });
      if (!assignment) throw new BadRequestException({ code: 'NOT_A_COURSE_MENTOR', message: 'This mentor is not assigned to the course' });
    }
    const updated = await this.prisma.supportThread.update({ where: { id }, data: { mentorId: dto.mentorId } });
    await this.audit.record({ actorId: user.id, action: thread.mentorId ? 'support.mentor.reassign' : 'support.mentor.assign', resourceType: 'SupportThread', resourceId: id, ipAddress: ip, metadata: { from: thread.mentorId, to: dto.mentorId } });
    if (dto.mentorId) {
      await this.notifications.notify(dto.mentorId, { type: 'support.assigned', title: `You were assigned a question in ${thread.course.title}`, body: thread.subject, link: `/support/${id}` });
    }
    return updated;
  }

  // ─── mentor administration ───

  async mentors(q: PaginationQueryDto) {
    const where: Prisma.UserWhereInput = {
      roles: { some: { role: { key: 'MENTOR' } } },
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
          mentorAssignments: { where: { active: true }, select: { id: true, course: { select: { id: true, title: true } } } },
          _count: { select: { mentoredThreads: { where: { status: { not: 'RESOLVED' } } }, supportMessages: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async assign(actor: AuthUser, dto: MentorAssignmentDto) {
    const mentor = await this.prisma.user.findUnique({ where: { id: dto.mentorId }, include: { roles: { include: { role: true } } } });
    if (!mentor || !mentor.roles.some((r) => r.role.key === 'MENTOR')) throw new BadRequestException({ code: 'NOT_A_MENTOR', message: 'User does not hold the mentor role' });
    const assignment = await this.prisma.mentorAssignment.upsert({
      where: { mentorId_courseId: { mentorId: dto.mentorId, courseId: dto.courseId } },
      create: { mentorId: dto.mentorId, courseId: dto.courseId, assignedById: actor.id },
      update: { active: true, assignedById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, action: 'mentor.assign', resourceType: 'MentorAssignment', resourceId: assignment.id, metadata: { ...dto } });
    return assignment;
  }

  async unassign(actor: AuthUser, id: string) {
    const assignment = await this.prisma.mentorAssignment.update({ where: { id }, data: { active: false } });
    // Return their open threads to the course creator's queue.
    await this.prisma.supportThread.updateMany({ where: { mentorId: assignment.mentorId, courseId: assignment.courseId, status: { not: 'RESOLVED' } }, data: { mentorId: null } });
    await this.audit.record({ actorId: actor.id, action: 'mentor.unassign', resourceType: 'MentorAssignment', resourceId: id });
    return assignment;
  }
}
