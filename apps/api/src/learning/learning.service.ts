import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';
import { AccessService } from './access.service';
import { computeProgress, ProgressService, serialiseProgress } from './progress.service';
import type { AccessDecision } from './access.policy';

export type CheckpointState = 'COMPLETED' | 'CURRENT' | 'AVAILABLE' | 'UPCOMING' | 'LOCKED_PREMIUM' | 'LOCKED_PREREQUISITE' | 'LOCKED';

function lockState(d: AccessDecision): CheckpointState | null {
  if (d.granted) return null;
  if (d.requiresPurchase) return 'LOCKED_PREMIUM';
  if (d.requiresPrerequisite) return 'LOCKED_PREREQUISITE';
  return 'LOCKED';
}

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly progress: ProgressService,
  ) {}

  async enroll(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { status: true } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException({ code: 'COURSE_NOT_PUBLISHED', message: 'Course not available' });
    const enrollment = await this.progress.ensureEnrollment(user.id, courseId);
    return enrollment;
  }

  /** Learner dashboard: continue-learning list ordered by most recent activity. */
  async myCourses(user: AuthUser) {
    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { userId: user.id },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            thumbnailUrl: true,
            coverPattern: true,
            estimatedMinutes: true,
            subject: { select: { name: true, accentColor: true } },
            creator: { select: { fullName: true } },
          },
        },
      },
    });
    const lessonIds = enrollments.map((e) => e.lastLessonId).filter((x): x is string => !!x);
    const lessons = await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } });
    const titleOf = new Map(lessons.map((l) => [l.id, l.title]));
    const results = [];
    for (const e of enrollments) {
      const p = await this.progress.progressFor(user.id, e.courseId);
      const nextTitle = p.nextLessonId
        ? titleOf.get(p.nextLessonId) ?? (await this.prisma.lesson.findUnique({ where: { id: p.nextLessonId }, select: { title: true } }))?.title
        : null;
      results.push({
        course: e.course,
        enrolledAt: e.enrolledAt,
        lastActivityAt: e.lastActivityAt,
        completedAt: e.completedAt,
        progress: serialiseProgress(p),
        nextLesson: p.nextLessonId ? { id: p.nextLessonId, title: nextTitle } : null,
      });
    }
    return results;
  }

  async dashboard(user: AuthUser) {
    const courses = await this.myCourses(user);
    const [recentAttempts, certificates, openThreads, entitlements] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { userId: user.id, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { id: true, scorePercent: true, passed: true, submittedAt: true, quiz: { select: { id: true, title: true, course: { select: { title: true } } } } },
      }),
      this.prisma.certificate.count({ where: { userId: user.id, status: 'VALID' } }),
      this.prisma.supportThread.count({ where: { learnerId: user.id, status: { in: ['OPEN', 'WAITING_FOR_RESPONSE', 'ANSWERED'] } } }),
      this.prisma.courseEntitlement.count({ where: { userId: user.id, revokedAt: null } }),
    ]);
    const inProgress = courses.filter((c) => !c.completedAt);
    return {
      continueLearning: inProgress[0] ?? null,
      inProgress: inProgress.slice(1),
      completed: courses.filter((c) => c.completedAt),
      recentAttempts,
      summary: { certificates, openThreads, purchasedCourses: entitlements, activeCourses: inProgress.length },
    };
  }

  /** The winding course journey: every checkpoint with its state, derived on the server. */
  /**
   * The course journey. With no user (or a user who has not enrolled or
   * paid) it is a read-only map: every checkpoint is listed with the locks
   * the access policy would apply, but no content is returned.
   */
  async journey(user: AuthUser | undefined, courseId: string) {
    const ctx = await this.access.courseContext(user, courseId);
    if (ctx.course.status !== 'PUBLISHED' && !ctx.isStaff) throw new NotFoundException({ code: 'COURSE_NOT_PUBLISHED', message: 'Course not available' });
    const structure = await this.progress.structure(courseId, undefined, ctx.isStaff);
    const progress = user
      ? await this.progress.progressFor(user.id, courseId, undefined, structure)
      : computeProgress(structure, new Set(), new Set(), null);
    // Signed-out viewers: a nil UUID matches no rows, so every per-user lookup is empty.
    const userId = user?.id ?? '00000000-0000-0000-0000-000000000000';
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { id: true, title: true, slug: true, shortDescription: true, approvedPrice: true, currency: true, coverPattern: true, subject: { select: { name: true, accentColor: true } }, creator: { select: { fullName: true } } },
    });
    const enrollment = await this.prisma.courseEnrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    const attempts = await this.prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { userId, status: 'SUBMITTED', quiz: { courseId } },
      _count: { _all: true },
      _max: { scorePercent: true },
    });
    const attemptsByQuiz = new Map(attempts.map((a) => [a.quizId, { count: a._count._all, best: a._max.scorePercent }]));
    const quizMeta = await this.prisma.quiz.findMany({ where: { courseId }, select: { id: true, maxAttempts: true } });
    const maxAttempts = new Map(quizMeta.map((q) => [q.id, q.maxAttempts]));
    const currentModuleIndex = structure.modules.findIndex((m) => m.lessons.some((l) => l.id === progress.nextLessonId));

    const quizCheckpoint = (q: { id: string; title: string; passingScore: number }, lock: CheckpointState | null, later: boolean, isGate: boolean) => {
      const stats = attemptsByQuiz.get(q.id);
      const max = maxAttempts.get(q.id) ?? null;
      const passed = progress.passedQuizIds.has(q.id);
      return {
        kind: 'quiz' as const,
        id: q.id,
        title: q.title,
        passingScore: q.passingScore,
        isPrerequisiteGate: isGate,
        attemptsUsed: stats?.count ?? 0,
        attemptsRemaining: max === null ? null : Math.max(0, max - (stats?.count ?? 0)),
        bestScore: stats?.best ?? null,
        state: (passed ? 'COMPLETED' : lock ?? (later ? 'UPCOMING' : 'AVAILABLE')) as CheckpointState,
      };
    };

    const gateQuizIds = new Set(structure.modules.map((m) => m.prerequisiteQuizId).filter(Boolean) as string[]);
    const modules = structure.modules.map((m, index) => {
      const decision = this.access.decide(ctx, m);
      const lock = lockState(decision);
      const mp = progress.modules.find((x) => x.moduleId === m.id)!;
      const later = currentModuleIndex >= 0 && index > currentModuleIndex;
      const lessons = m.lessons.map((l) => ({
        kind: 'lesson' as const,
        id: l.id,
        title: l.title,
        estimatedMinutes: l.estimatedMinutes,
        state: (progress.completedLessonIds.has(l.id)
          ? 'COMPLETED'
          : lock ?? (l.id === progress.nextLessonId ? 'CURRENT' : later ? 'UPCOMING' : 'AVAILABLE')) as CheckpointState,
      }));
      const quizzes = m.quizzes.map((q) => quizCheckpoint(q, lock, later, gateQuizIds.has(q.id)));
      const moduleState: CheckpointState = mp.completed && mp.lessonsTotal + mp.quizzesTotal > 0
        ? 'COMPLETED'
        : lock ?? (index === currentModuleIndex ? 'CURRENT' : later ? 'UPCOMING' : 'AVAILABLE');
      return {
        id: m.id,
        title: m.title,
        summary: m.summary,
        position: m.position,
        access: m.access,
        isPublished: m.isPublished,
        state: moduleState,
        decision,
        prerequisiteQuiz: m.prerequisiteQuizId
          ? { id: m.prerequisiteQuizId, passed: progress.passedQuizIds.has(m.prerequisiteQuizId), title: findQuizTitle(structure, m.prerequisiteQuizId) }
          : null,
        progress: mp,
        // Lesson-attached quizzes follow their lesson; module quizzes close the module.
        checkpoints: [
          ...lessons.flatMap((l) => [l, ...quizzes.filter((q) => m.quizzes.find((mq) => mq.id === q.id)?.lessonId === l.id)]),
          ...quizzes.filter((q) => !m.quizzes.find((mq) => mq.id === q.id)?.lessonId),
        ],
      };
    });

    return {
      course: { ...course, approvedPrice: course.approvedPrice ? Number(course.approvedPrice) : null },
      enrolled: !!enrollment,
      preview: ctx.isStaff,
      hasEntitlement: ctx.hasEntitlement,
      isPaidCourse: ctx.isPaidCourse,
      progress: serialiseProgress(progress),
      courseQuizzes: structure.courseQuizzes.map((q) => quizCheckpoint(q, null, false, gateQuizIds.has(q.id))),
      modules,
      certificate: await this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { id: true, serial: true, status: true } }),
    };
  }

  async readLesson(user: AuthUser, lessonId: string) {
    const { lesson, ctx, decision } = await this.access.assertLessonAccess(user, lessonId);
    const courseId = lesson.module.courseId;
    if (!decision.preview) await this.progress.touchLesson(user.id, courseId, lessonId);
    const structure = await this.progress.structure(courseId, undefined, ctx.isStaff);
    const ordered = structure.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m })));
    const idx = ordered.findIndex((l) => l.id === lessonId);
    const neighbour = (i: number) => {
      const l = ordered[i];
      if (!l) return null;
      const d = this.access.decide(ctx, l.module);
      return { id: l.id, title: l.title, moduleTitle: l.module.title, locked: !d.granted, reason: d.reason };
    };
    const [progressRow, course, quizzes] = await Promise.all([
      this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } }),
      this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true, slug: true } }),
      this.prisma.quiz.findMany({ where: { lessonId, ...(ctx.isStaff ? {} : { isPublished: true }) }, select: { id: true, title: true } }),
    ]);
    const moduleStructure = structure.modules.find((m) => m.id === lesson.moduleId);
    // The module's own checkpoint follows its last lesson.
    const isLastInModule = moduleStructure?.lessons.at(-1)?.id === lessonId;
    const checkpoints = [
      ...quizzes,
      ...(isLastInModule ? (moduleStructure?.quizzes ?? []).filter((q) => !q.lessonId).map((q) => ({ id: q.id, title: q.title })) : []),
    ].map((q) => ({ ...q, passed: ctx.passedQuizIds.has(q.id) }));
    return {
      lesson: { id: lesson.id, title: lesson.title, summary: lesson.summary, content: lesson.content, estimatedMinutes: lesson.estimatedMinutes, updatedAt: lesson.updatedAt },
      module: {
        id: lesson.module.id,
        title: lesson.module.title,
        position: lesson.module.position,
        lessons: (moduleStructure?.lessons ?? []).map((l) => ({ id: l.id, title: l.title })),
      },
      course,
      completed: !!progressRow?.completedAt,
      preview: decision.preview,
      position: { index: idx + 1, total: ordered.length },
      previous: neighbour(idx - 1),
      next: neighbour(idx + 1),
      quizzes: checkpoints,
    };
  }

  async completeLesson(user: AuthUser, lessonId: string) {
    const { lesson, decision } = await this.access.assertLessonAccess(user, lessonId);
    if (decision.preview) throw new BadRequestException({ code: 'PREVIEW_MODE', message: 'Progress is not recorded in preview mode' });
    if (!user.permissions.has('courses.learn')) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not permitted' });
    return this.progress.completeLesson(user.id, lesson.module.courseId, lessonId);
  }

  async resume(user: AuthUser, courseId: string) {
    const p = await this.progress.progressFor(user.id, courseId);
    return { nextLessonId: p.nextLessonId, percent: p.percent, isComplete: p.isComplete };
  }
}

function findQuizTitle(s: { modules: { quizzes: { id: string; title: string }[] }[]; courseQuizzes: { id: string; title: string }[] }, id: string) {
  for (const m of s.modules) for (const q of m.quizzes) if (q.id === id) return q.title;
  return s.courseQuizzes.find((q) => q.id === id)?.title ?? 'Prerequisite quiz';
}
