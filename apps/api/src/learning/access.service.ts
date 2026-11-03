import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CourseStatus, ModuleAccess } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../common/auth-user';
import { AccessDecision, decideModuleAccess } from './access.policy';

export interface CourseAccessContext {
  course: { id: string; status: CourseStatus; creatorId: string; approvedPrice: number | null; currency: string };
  authenticated: boolean;
  accountActive: boolean;
  isStaff: boolean;
  isOwner: boolean;
  isPaidCourse: boolean;
  hasEntitlement: boolean;
  passedQuizIds: Set<string>;
  freeRequiresSignIn: boolean;
}

interface ModuleFacts {
  id: string;
  access: ModuleAccess;
  isPublished: boolean;
  prerequisiteQuizId: string | null;
}

const ACCESS_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Sign in to open this lesson',
  PURCHASE_REQUIRED: 'This module is part of the premium course',
  PREREQUISITE_NOT_COMPLETED: 'Pass the prerequisite quiz to unlock this module',
  PURCHASE_AND_PREREQUISITE_REQUIRED: 'Purchase the course and pass the prerequisite quiz to unlock this module',
  COURSE_NOT_PUBLISHED: 'This course is not available',
  MODULE_NOT_PUBLISHED: 'This module is not available yet',
  ACCOUNT_NOT_AUTHORIZED: 'Your account cannot access this content',
};

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  /** Staff = course creator, an assigned active mentor, or a reviewing administrator. */
  async isCourseStaff(user: AuthUser | undefined, course: { id: string; creatorId: string }, tx?: Tx): Promise<boolean> {
    if (!user) return false;
    if (course.creatorId === user.id) return true;
    if (user.permissions.has('courses.manage_any') || user.permissions.has('courses.review')) return true;
    if (user.roles.includes('MENTOR')) {
      const assignment = await (tx ?? this.prisma).mentorAssignment.findFirst({ where: { mentorId: user.id, courseId: course.id, active: true } });
      return !!assignment;
    }
    return false;
  }

  /** Loads every fact needed to evaluate all modules of a course in a constant number of queries. */
  async courseContext(user: AuthUser | undefined, courseId: string, tx?: Tx): Promise<CourseAccessContext> {
    const db = tx ?? this.prisma;
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, creatorId: true, approvedPrice: true, currency: true },
    });
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    const price = course.approvedPrice ? Number(course.approvedPrice) : null;
    const isPaidCourse = !!price && price > 0;

    let hasEntitlement = false;
    let passedQuizIds = new Set<string>();
    if (user) {
      const [entitlement, passes] = await Promise.all([
        db.courseEntitlement.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } }),
        db.quizPass.findMany({ where: { userId: user.id, quiz: { courseId } }, select: { quizId: true } }),
      ]);
      hasEntitlement = !!entitlement && !entitlement.revokedAt;
      passedQuizIds = new Set(passes.map((p) => p.quizId));
    }
    return {
      course: { ...course, approvedPrice: price },
      authenticated: !!user,
      accountActive: !!user && (user.status === 'ACTIVE' || user.status === 'PENDING_VERIFICATION'),
      isStaff: await this.isCourseStaff(user, course, tx),
      isOwner: !!user && user.id === course.creatorId,
      isPaidCourse,
      hasEntitlement: hasEntitlement || !isPaidCourse,
      passedQuizIds,
      freeRequiresSignIn: await this.settings.get('access.freeModulesRequireSignIn', tx),
    };
  }

  decide(ctx: CourseAccessContext, module: ModuleFacts): AccessDecision {
    return decideModuleAccess({
      authenticated: ctx.authenticated,
      accountActive: ctx.accountActive,
      isStaff: ctx.isStaff,
      courseStatus: ctx.course.status,
      modulePublished: module.isPublished,
      access: module.access,
      isPaidCourse: ctx.isPaidCourse,
      hasEntitlement: ctx.hasEntitlement,
      prerequisiteQuizId: module.prerequisiteQuizId,
      prerequisitePassed: !!module.prerequisiteQuizId && ctx.passedQuizIds.has(module.prerequisiteQuizId),
      freeRequiresSignIn: ctx.freeRequiresSignIn,
    });
  }

  async evaluateModuleAccess(params: { user?: AuthUser; courseId: string; moduleId: string }): Promise<AccessDecision> {
    const module = await this.prisma.courseModule.findFirst({ where: { id: params.moduleId, courseId: params.courseId } });
    if (!module) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Module not found' });
    const ctx = await this.courseContext(params.user, params.courseId);
    return this.decide(ctx, module);
  }

  /** Throws a 401/403 carrying the access reason when the module is locked. */
  enforce(decision: AccessDecision) {
    if (decision.granted) return;
    throw new ForbiddenException({
      code: decision.reason,
      message: ACCESS_MESSAGES[decision.reason] ?? 'Access denied',
      details: { requiresPurchase: decision.requiresPurchase, requiresPrerequisite: decision.requiresPrerequisite, prerequisiteQuizId: decision.prerequisiteQuizId },
    });
  }

  async assertLessonAccess(user: AuthUser | undefined, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    const ctx = await this.courseContext(user, lesson.module.courseId);
    const decision = this.decide(ctx, lesson.module);
    if (decision.granted && !lesson.isPublished && !ctx.isStaff) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    }
    this.enforce(decision);
    return { lesson, ctx, decision };
  }

  /**
   * Quiz access: a module/lesson quiz inherits its module's access; a
   * course-level quiz (e.g. a placement or prerequisite quiz) is open to any
   * signed-in learner of a published course.
   */
  async assertQuizAccess(user: AuthUser | undefined, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { module: true, lesson: { include: { module: true } } },
    });
    if (!quiz) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Quiz not found' });
    const ctx = await this.courseContext(user, quiz.courseId);
    const owningModule = quiz.module ?? quiz.lesson?.module ?? null;
    if (!ctx.isStaff && !quiz.isPublished) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Quiz not found' });
    const decision = owningModule
      ? this.decide(ctx, owningModule)
      : decideModuleAccess({
          authenticated: ctx.authenticated,
          accountActive: ctx.accountActive,
          isStaff: ctx.isStaff,
          courseStatus: ctx.course.status,
          modulePublished: true,
          access: 'FREE',
          isPaidCourse: ctx.isPaidCourse,
          hasEntitlement: ctx.hasEntitlement,
          prerequisiteQuizId: null,
          prerequisitePassed: true,
          freeRequiresSignIn: true,
        });
    this.enforce(decision);
    return { quiz, ctx, decision };
  }

  /** Owner or administrator with course management permission. */
  async assertCanManageCourse(user: AuthUser, courseId: string, tx?: Tx) {
    const course = await (tx ?? this.prisma).course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    const isOwner = course.creatorId === user.id && user.permissions.has('courses.manage_own');
    if (!isOwner && !user.permissions.has('courses.manage_any')) {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You can only manage your own courses' });
    }
    return { course, isOwner };
  }
}
