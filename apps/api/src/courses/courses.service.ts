import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus, Prisma, ReviewDecision } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { AccessService } from '../learning/access.service';
import { ProgressService, serialiseProgress } from '../learning/progress.service';
import { paginate, skipTake } from '../common/pagination';
import { slugify } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import { Actor, CourseAction, isContentEditable, resolveTransition } from './course-workflow';
import { PREMIUM_POLICIES, PREREQUISITE_POLICIES } from '../learning/access.policy';
import type {
  AdminCourseQueryDto,
  CatalogQueryDto,
  CreateCourseDto,
  DecidePriceDto,
  ProposePriceDto,
  TransitionDto,
  UpdateCourseDto,
} from './courses.dto';

const COVER_PATTERNS = ['contour', 'switchback', 'terrace', 'delta', 'ridge', 'meander'];

const CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  thumbnailUrl: true,
  coverPattern: true,
  difficulty: true,
  estimatedMinutes: true,
  approvedPrice: true,
  currency: true,
  publishedAt: true,
  subject: { select: { id: true, name: true, slug: true, accentColor: true } },
  category: { select: { id: true, name: true, slug: true } },
  creator: { select: { id: true, fullName: true, displayName: true } },
  _count: { select: { modules: { where: { isPublished: true } }, enrollments: true } },
} satisfies Prisma.CourseSelect;

const ACTION_DECISION: Record<CourseAction, ReviewDecision> = {
  submit: 'SUBMITTED',
  withdraw: 'UNPUBLISHED',
  approve: 'APPROVED',
  reject: 'REJECTED',
  publish: 'PUBLISHED',
  unpublish: 'UNPUBLISHED',
  archive: 'ARCHIVED',
  restore: 'UNPUBLISHED',
};

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly access: AccessService,
    private readonly progress: ProgressService,
  ) {}

  // ───────────── Public catalogue ─────────────

  async catalog(q: CatalogQueryDto) {
    const where: Prisma.CourseWhereInput = {
      status: 'PUBLISHED',
      ...(q.subject ? { subject: { slug: q.subject } } : {}),
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
      ...(q.price === 'free' ? { OR: [{ approvedPrice: null }, { approvedPrice: 0 }] } : {}),
      ...(q.price === 'paid' ? { approvedPrice: { gt: 0 } } : {}),
      ...(q.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q.search, mode: 'insensitive' } },
                  { shortDescription: { contains: q.search, mode: 'insensitive' } },
                  { learningOutcomes: { has: q.search } },
                  { creator: { fullName: { contains: q.search, mode: 'insensitive' } } },
                ],
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.CourseOrderByWithRelationInput =
      q.sort === 'popular'
        ? { enrollments: { _count: 'desc' } }
        : q.sort === 'title'
          ? { title: 'asc' }
          : q.sort === 'shortest'
            ? { estimatedMinutes: 'asc' }
            : { publishedAt: 'desc' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, orderBy, ...skipTake(q), select: CARD_SELECT }),
      this.prisma.course.count({ where }),
    ]);
    return paginate(items.map(toCard), total, q);
  }

  async publicDetail(slugOrId: string, user?: AuthUser) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
    const course = await this.prisma.course.findFirst({
      where: isUuid ? { id: slugOrId } : { slug: slugOrId },
      select: {
        ...CARD_SELECT,
        description: true,
        learningOutcomes: true,
        status: true,
        creatorId: true,
        completionRule: true,
        certificateEnabled: true,
        updatedAt: true,
        creator: { select: { id: true, fullName: true, displayName: true, bio: true, avatarUrl: true } },
        modules: {
          where: { isPublished: true },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            access: true,
            isPublished: true,
            prerequisiteQuizId: true,
            prerequisiteQuiz: { select: { id: true, title: true } },
            lessons: { where: { isPublished: true }, orderBy: { position: 'asc' }, select: { id: true, title: true, estimatedMinutes: true } },
            quizzes: { where: { isPublished: true }, select: { id: true, title: true } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    const ctx = await this.access.courseContext(user, course.id);
    if (course.status !== 'PUBLISHED' && !ctx.isStaff) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    }
    const enrollment = user
      ? await this.prisma.courseEnrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } })
      : null;
    const progress = enrollment ? serialiseProgress(await this.progress.progressFor(user!.id, course.id)) : null;
    const { modules, ...rest } = course;
    return {
      ...toCard(rest),
      description: course.description,
      learningOutcomes: course.learningOutcomes,
      status: course.status,
      completionRule: course.completionRule,
      certificateEnabled: course.certificateEnabled,
      updatedAt: course.updatedAt,
      creator: course.creator,
      lessonCount: modules.reduce((s, m) => s + m.lessons.length, 0),
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        position: m.position,
        access: m.access,
        prerequisiteQuiz: m.prerequisiteQuiz,
        lessons: m.lessons,
        quizCount: m.quizzes.length,
        decision: this.access.decide(ctx, m),
      })),
      viewer: {
        authenticated: !!user,
        enrolled: !!enrollment,
        hasEntitlement: ctx.isPaidCourse ? ctx.hasEntitlement : null,
        isStaff: ctx.isStaff,
        isOwner: ctx.isOwner,
        progress,
      },
    };
  }

  // ───────────── Creator workspace ─────────────

  async mine(user: AuthUser, status?: CourseStatus) {
    const courses = await this.prisma.course.findMany({
      where: { creatorId: user.id, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        ...CARD_SELECT,
        status: true,
        proposedPrice: true,
        updatedAt: true,
        submittedAt: true,
        priceProposals: { where: { status: 'PENDING' }, select: { id: true, amount: true }, take: 1 },
        reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, feedback: true, createdAt: true } },
      },
    });
    return courses.map((c) => ({ ...toCard(c), status: c.status, proposedPrice: num(c.proposedPrice), updatedAt: c.updatedAt, submittedAt: c.submittedAt, pendingPrice: c.priceProposals[0] ? num(c.priceProposals[0].amount) : null, lastReview: c.reviews[0] ?? null }));
  }

  private async uniqueSlug(title: string, tx: Tx, excludeId?: string) {
    const base = slugify(title) || 'course';
    let slug = base;
    for (let i = 2; ; i++) {
      const clash = await tx.course.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
      if (!clash) return slug;
      slug = `${base}-${i}`;
    }
  }

  private async assertTaxonomy(subjectId: string, categoryId?: string | null, tx?: Tx) {
    const db = tx ?? this.prisma;
    const subject = await db.subject.findUnique({ where: { id: subjectId } });
    if (!subject || subject.archivedAt) throw new BadRequestException({ code: 'INVALID_SUBJECT', message: 'Choose an active subject' });
    if (categoryId) {
      const category = await db.category.findUnique({ where: { id: categoryId } });
      if (!category || category.subjectId !== subjectId || category.archivedAt) {
        throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'Category does not belong to this subject' });
      }
    }
  }

  async create(user: AuthUser, dto: CreateCourseDto) {
    await this.assertTaxonomy(dto.subjectId, dto.categoryId);
    const defaultRule = await this.settings.get('courses.defaultCompletionRule');
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          title: dto.title,
          slug: await this.uniqueSlug(dto.title, tx),
          shortDescription: dto.shortDescription,
          description: dto.description ?? '',
          subjectId: dto.subjectId,
          categoryId: dto.categoryId,
          difficulty: dto.difficulty,
          learningOutcomes: (dto.learningOutcomes ?? []).map((o) => o.trim()).filter(Boolean),
          estimatedMinutes: dto.estimatedMinutes,
          creatorId: user.id,
          completionRule: defaultRule as 'ALL_LESSONS' | 'ALL_LESSONS_AND_QUIZZES',
          coverPattern: COVER_PATTERNS[Math.floor(Math.random() * COVER_PATTERNS.length)],
          proposedPrice: dto.proposedPrice,
        },
      });
      if (dto.proposedPrice !== undefined) {
        await tx.coursePriceProposal.create({ data: { courseId: course.id, proposedById: user.id, amount: dto.proposedPrice, currency: course.currency } });
      }
      await this.audit.record({ actorId: user.id, action: 'course.create', resourceType: 'Course', resourceId: course.id, metadata: { title: course.title } }, tx);
      return course;
    });
  }

  /** Full editable representation for the creator/admin editor. */
  async editorView(user: AuthUser, id: string) {
    await this.access.assertCanManageCourse(user, id);
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: { orderBy: { position: 'asc' }, select: { id: true, title: true, position: true, isPublished: true, estimatedMinutes: true, updatedAt: true } },
            quizzes: { select: { id: true, title: true, isPublished: true, lessonId: true, _count: { select: { questions: true } } } },
            prerequisiteQuiz: { select: { id: true, title: true } },
          },
        },
        quizzes: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, moduleId: true, lessonId: true, isPublished: true, passingScore: true, _count: { select: { questions: true } } } },
        priceProposals: { orderBy: { createdAt: 'desc' }, include: { proposedBy: { select: { fullName: true } }, decidedBy: { select: { fullName: true } } } },
        reviews: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { fullName: true } } } },
      },
    });
    return {
      ...course,
      proposedPrice: num(course.proposedPrice),
      approvedPrice: num(course.approvedPrice),
      priceProposals: course.priceProposals.map((p) => ({ ...p, amount: num(p.amount) })),
      editable: isContentEditable(course.status),
      readiness: this.readiness(course),
    };
  }

  /** Checks a creator must pass before submission or publication. */
  private readiness(course: {
    description: string;
    learningOutcomes: string[];
    approvedPrice: Prisma.Decimal | null;
    modules: { isPublished: boolean; access: string; prerequisiteQuizId: string | null; lessons: { isPublished: boolean }[] }[];
  }) {
    const issues: string[] = [];
    const published = course.modules.filter((m) => m.isPublished);
    if (course.description.trim().length < 40) issues.push('Write a full description (at least 40 characters).');
    if (course.learningOutcomes.length < 2) issues.push('Add at least two learning outcomes.');
    if (!published.length) issues.push('Publish at least one module.');
    if (!published.some((m) => m.lessons.some((l) => l.isPublished))) issues.push('Publish at least one lesson.');
    for (const m of published) {
      if (PREREQUISITE_POLICIES.includes(m.access as never) && !m.prerequisiteQuizId) {
        issues.push('Every module that requires a prerequisite quiz must have one selected.');
        break;
      }
    }
    const hasPremium = published.some((m) => PREMIUM_POLICIES.includes(m.access as never));
    const priced = !!course.approvedPrice && Number(course.approvedPrice) > 0;
    return { canSubmit: issues.length === 0, issues, hasPremiumModules: hasPremium, needsApprovedPrice: hasPremium && !priced };
  }

  async update(user: AuthUser, id: string, dto: UpdateCourseDto) {
    const { course } = await this.access.assertCanManageCourse(user, id);
    if (!isContentEditable(course.status)) {
      throw new ConflictException({ code: 'COURSE_LOCKED', message: 'This course cannot be edited while it is under review or archived' });
    }
    const subjectId = dto.subjectId ?? course.subjectId;
    if (dto.subjectId || dto.categoryId) await this.assertTaxonomy(subjectId, dto.categoryId === undefined ? course.categoryId : dto.categoryId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
        where: { id },
        data: {
          title: dto.title,
          slug: dto.title && dto.title !== course.title && course.status !== 'PUBLISHED' ? await this.uniqueSlug(dto.title, tx, id) : undefined,
          shortDescription: dto.shortDescription,
          description: dto.description,
          subjectId: dto.subjectId,
          categoryId: dto.categoryId,
          difficulty: dto.difficulty,
          learningOutcomes: dto.learningOutcomes?.map((o) => o.trim()).filter(Boolean),
          estimatedMinutes: dto.estimatedMinutes,
          thumbnailUrl: dto.thumbnailUrl,
          completionRule: dto.completionRule,
          certificateEnabled: dto.certificateEnabled,
        },
      });
      await this.audit.record({ actorId: user.id, action: 'course.update', resourceType: 'Course', resourceId: id, metadata: { fields: Object.keys(dto) } }, tx);
      return updated;
    });
  }

  async remove(user: AuthUser, id: string) {
    const { course } = await this.access.assertCanManageCourse(user, id);
    const [enrollments, transactions] = await Promise.all([
      this.prisma.courseEnrollment.count({ where: { courseId: id } }),
      this.prisma.paymentTransaction.count({ where: { courseId: id } }),
    ]);
    if (course.status !== 'DRAFT' || enrollments || transactions) {
      throw new ConflictException({ code: 'COURSE_HAS_HISTORY', message: 'Only unused draft courses can be deleted. Archive it instead.' });
    }
    await this.prisma.$transaction(async (tx) => {
      // Detach prerequisite references before cascading deletes.
      await tx.courseModule.updateMany({ where: { courseId: id }, data: { prerequisiteQuizId: null } });
      await tx.course.delete({ where: { id } });
      await this.audit.record({ actorId: user.id, action: 'course.delete', resourceType: 'Course', resourceId: id, metadata: { title: course.title } }, tx);
    });
    return { deleted: true };
  }

  // ───────────── Workflow ─────────────

  async transition(user: AuthUser, id: string, dto: TransitionDto, ip?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { modules: { include: { lessons: { select: { isPublished: true } } } } },
    });
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    const actors: Actor[] = [];
    if (course.creatorId === user.id && user.permissions.has('courses.manage_own')) actors.push('owner');
    if (user.permissions.has('courses.review')) actors.push('admin');
    if (!actors.length) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You cannot change this course' });
    // An administrator who authored the course cannot approve their own submission.
    const reviewerActors = (dto.action === 'approve' || dto.action === 'reject') && course.creatorId === user.id ? actors.filter((a) => a !== 'admin') : actors;

    const result = resolveTransition(dto.action, course.status, reviewerActors);
    if (!result.ok) {
      throw result.reason === 'INVALID_TRANSITION'
        ? new ConflictException({ code: 'INVALID_TRANSITION', message: `A ${course.status.toLowerCase()} course cannot be ${pastTense(dto.action)}` })
        : new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You cannot perform this action on this course' });
    }
    const readiness = this.readiness(course);
    if (dto.action === 'submit' && !readiness.canSubmit) {
      throw new BadRequestException({ code: 'COURSE_NOT_READY', message: 'The course is not ready for review', details: readiness.issues });
    }
    if (dto.action === 'publish' && readiness.needsApprovedPrice) {
      throw new BadRequestException({ code: 'PRICE_NOT_APPROVED', message: 'Approve a price before publishing a course with premium modules' });
    }
    if (dto.action === 'reject' && !dto.feedback?.trim()) {
      throw new BadRequestException({ code: 'FEEDBACK_REQUIRED', message: 'Explain what the creator needs to change' });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.course.updateMany({
        where: { id, status: course.status },
        data: {
          status: result.to,
          ...(dto.action === 'submit' ? { submittedAt: now } : {}),
          ...(dto.action === 'approve' ? { approvedAt: now } : {}),
          ...(dto.action === 'publish' && !course.publishedAt ? { publishedAt: now } : {}),
          ...(dto.action === 'archive' ? { archivedAt: now } : {}),
          ...(dto.action === 'restore' ? { archivedAt: null } : {}),
        },
      });
      if (!claimed.count) throw new ConflictException({ code: 'STALE_STATE', message: 'The course changed while you were working. Reload and try again.' });
      await tx.courseReview.create({ data: { courseId: id, actorId: user.id, decision: ACTION_DECISION[dto.action], feedback: dto.feedback } });
      await this.audit.record(
        { actorId: user.id, action: `course.${dto.action}`, resourceType: 'Course', resourceId: id, ipAddress: ip, metadata: { from: course.status, to: result.to, feedback: dto.feedback } },
        tx,
      );
      await this.notifyTransition(tx, dto.action, course, dto.feedback);
      return tx.course.findUniqueOrThrow({ where: { id } });
    });
    return updated;
  }

  private async notifyTransition(tx: Tx, action: CourseAction, course: { id: string; title: string; creatorId: string }, feedback?: string) {
    const link = `/creator/courses/${course.id}`;
    if (action === 'submit') {
      const reviewers = await tx.userRole.findMany({ where: { role: { key: 'ADMIN' } }, select: { userId: true } });
      await this.notifications.notify(reviewers.map((r) => r.userId), { type: 'course.submitted', title: `Course submitted for review: ${course.title}`, link: `/admin/courses/${course.id}` }, tx);
    } else if (action === 'approve') {
      await this.notifications.notify(course.creatorId, { type: 'course.approved', title: `Approved: ${course.title}`, body: feedback ?? 'You can now publish it.', link }, tx);
    } else if (action === 'reject') {
      await this.notifications.notify(course.creatorId, { type: 'course.rejected', title: `Changes requested: ${course.title}`, body: feedback, link }, tx);
    } else if (action === 'publish') {
      await this.notifications.notify(course.creatorId, { type: 'course.published', title: `Published: ${course.title}`, link }, tx);
    } else if (action === 'unpublish' || action === 'archive') {
      await this.notifications.notify(course.creatorId, { type: 'course.activity', title: `${action === 'archive' ? 'Archived' : 'Unpublished'}: ${course.title}`, body: feedback, link }, tx);
    }
  }

  // ───────────── Pricing ─────────────

  async proposePrice(user: AuthUser, courseId: string, dto: ProposePriceDto) {
    const { course } = await this.access.assertCanManageCourse(user, courseId);
    if (course.status === 'ARCHIVED') throw new ConflictException({ code: 'COURSE_LOCKED', message: 'Archived courses cannot be repriced' });
    return this.prisma.$transaction(async (tx) => {
      await tx.coursePriceProposal.updateMany({ where: { courseId, status: 'PENDING' }, data: { status: 'WITHDRAWN' } });
      const proposal = await tx.coursePriceProposal.create({
        data: { courseId, proposedById: user.id, amount: dto.amount, currency: course.currency, note: dto.note },
      });
      await tx.course.update({ where: { id: courseId }, data: { proposedPrice: dto.amount } });
      await this.audit.record({ actorId: user.id, action: 'pricing.propose', resourceType: 'Course', resourceId: courseId, metadata: { amount: dto.amount } }, tx);
      return { ...proposal, amount: num(proposal.amount) };
    });
  }

  async decidePrice(user: AuthUser, proposalId: string, dto: DecidePriceDto, ip?: string) {
    const proposal = await this.prisma.coursePriceProposal.findUnique({ where: { id: proposalId }, include: { course: true } });
    if (!proposal) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Price proposal not found' });
    if (proposal.course.creatorId === user.id) throw new ForbiddenException({ code: 'SELF_REVIEW', message: 'You cannot approve your own price' });
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.coursePriceProposal.updateMany({
        where: { id: proposalId, status: 'PENDING' },
        data: { status: dto.decision, decidedById: user.id, decisionNote: dto.note, decidedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'This proposal has already been decided' });
      if (dto.decision === 'APPROVED') {
        await tx.course.update({ where: { id: proposal.courseId }, data: { approvedPrice: proposal.amount } });
      }
      await this.audit.record(
        {
          actorId: user.id,
          action: `pricing.${dto.decision.toLowerCase()}`,
          resourceType: 'Course',
          resourceId: proposal.courseId,
          ipAddress: ip,
          metadata: { proposalId, amount: num(proposal.amount), previous: num(proposal.course.approvedPrice), note: dto.note },
        },
        tx,
      );
      await this.notifications.notify(
        proposal.course.creatorId,
        {
          type: 'pricing.decision',
          title: `Price ${dto.decision === 'APPROVED' ? 'approved' : 'declined'} for ${proposal.course.title}`,
          body: dto.note,
          link: `/creator/courses/${proposal.courseId}`,
        },
        tx,
      );
      return { status: dto.decision };
    });
  }

  // ───────────── Administration ─────────────

  async adminList(q: AdminCourseQueryDto) {
    const where: Prisma.CourseWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.creatorId ? { creatorId: q.creatorId } : {}),
      ...(q.pricing === 'pending' ? { priceProposals: { some: { status: 'PENDING' } } } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { creator: { fullName: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total, counts] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: q.status === 'SUBMITTED' ? { submittedAt: 'asc' } : { updatedAt: q.order },
        ...skipTake(q),
        select: {
          ...CARD_SELECT,
          status: true,
          submittedAt: true,
          updatedAt: true,
          proposedPrice: true,
          priceProposals: { where: { status: 'PENDING' }, select: { id: true, amount: true, createdAt: true }, take: 1 },
        },
      }),
      this.prisma.course.count({ where }),
      this.prisma.course.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    return {
      ...paginate(
        items.map((c) => ({ ...toCard(c), status: c.status, submittedAt: c.submittedAt, updatedAt: c.updatedAt, pendingPrice: c.priceProposals[0] ? { id: c.priceProposals[0].id, amount: num(c.priceProposals[0].amount) } : null })),
        total,
        q,
      ),
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, (c._count as { _all: number })._all])),
    };
  }

  async pendingPriceProposals() {
    const items = await this.prisma.coursePriceProposal.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { course: { select: { id: true, title: true, approvedPrice: true, status: true } }, proposedBy: { select: { fullName: true } } },
    });
    return items.map((p) => ({ ...p, amount: num(p.amount), course: { ...p.course, approvedPrice: num(p.course.approvedPrice) } }));
  }
}

function num(d: Prisma.Decimal | null | undefined): number | null {
  return d === null || d === undefined ? null : Number(d);
}

function pastTense(action: CourseAction): string {
  return { submit: 'submitted', withdraw: 'withdrawn', approve: 'approved', reject: 'rejected', publish: 'published', unpublish: 'unpublished', archive: 'archived', restore: 'restored' }[action];
}

function toCard<T extends { approvedPrice: Prisma.Decimal | null; _count: { modules: number; enrollments: number } }>(c: T) {
  const { _count, approvedPrice, ...rest } = c;
  const price = num(approvedPrice);
  return { ...rest, price: price && price > 0 ? price : 0, isFree: !price || price <= 0, moduleCount: _count.modules, enrollmentCount: _count.enrollments };
}
