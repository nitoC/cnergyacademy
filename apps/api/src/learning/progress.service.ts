import { Injectable, Logger } from '@nestjs/common';
import type { CompletionRule } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

export interface StructureLesson {
  id: string;
  title: string;
  position: number;
  estimatedMinutes: number;
}
export interface StructureQuiz {
  id: string;
  title: string;
  lessonId: string | null;
  passingScore: number;
}
export interface StructureModule {
  id: string;
  title: string;
  summary: string | null;
  position: number;
  access: import('@prisma/client').ModuleAccess;
  isPublished: boolean;
  prerequisiteQuizId: string | null;
  lessons: StructureLesson[];
  quizzes: StructureQuiz[];
}
export interface CourseStructure {
  courseId: string;
  completionRule: CompletionRule;
  certificateEnabled: boolean;
  modules: StructureModule[];
  /** Published course-level quizzes (not attached to a module). */
  courseQuizzes: StructureQuiz[];
}

export interface ModuleProgress {
  moduleId: string;
  lessonsTotal: number;
  lessonsCompleted: number;
  quizzesTotal: number;
  quizzesPassed: number;
  completed: boolean;
}

export interface CourseProgress {
  courseId: string;
  percent: number;
  itemsTotal: number;
  itemsCompleted: number;
  lessonsTotal: number;
  lessonsCompleted: number;
  quizzesTotal: number;
  quizzesPassed: number;
  isComplete: boolean;
  completedLessonIds: Set<string>;
  passedQuizIds: Set<string>;
  modules: ModuleProgress[];
  nextLessonId: string | null;
}

/**
 * Progress is always derived from LessonProgress + QuizPass rows; the only
 * stored aggregate is CourseEnrollment.completedAt, which is set once inside
 * the same transaction that records the final completion.
 */
export function computeProgress(
  structure: CourseStructure,
  completedLessonIds: Set<string>,
  passedQuizIds: Set<string>,
  lastLessonId: string | null,
): CourseProgress {
  const countQuizzes = structure.completionRule === 'ALL_LESSONS_AND_QUIZZES';
  const modules: ModuleProgress[] = structure.modules.map((m) => {
    const lessonsCompleted = m.lessons.filter((l) => completedLessonIds.has(l.id)).length;
    const quizzesPassed = m.quizzes.filter((q) => passedQuizIds.has(q.id)).length;
    return {
      moduleId: m.id,
      lessonsTotal: m.lessons.length,
      lessonsCompleted,
      quizzesTotal: m.quizzes.length,
      quizzesPassed,
      completed: lessonsCompleted === m.lessons.length && (!countQuizzes || quizzesPassed === m.quizzes.length),
    };
  });
  const lessonsTotal = modules.reduce((s, m) => s + m.lessonsTotal, 0);
  const lessonsCompleted = modules.reduce((s, m) => s + m.lessonsCompleted, 0);
  const courseQuizPassed = structure.courseQuizzes.filter((q) => passedQuizIds.has(q.id)).length;
  const quizzesTotal = modules.reduce((s, m) => s + m.quizzesTotal, 0) + structure.courseQuizzes.length;
  const quizzesPassed = modules.reduce((s, m) => s + m.quizzesPassed, 0) + courseQuizPassed;
  const itemsTotal = lessonsTotal + (countQuizzes ? quizzesTotal : 0);
  const itemsCompleted = lessonsCompleted + (countQuizzes ? quizzesPassed : 0);

  const ordered = structure.modules.flatMap((m) => m.lessons.map((l) => l.id));
  let nextLessonId: string | null = null;
  if (lastLessonId && ordered.includes(lastLessonId) && !completedLessonIds.has(lastLessonId)) {
    nextLessonId = lastLessonId;
  } else {
    // First incomplete lesson after the last one touched, else the first incomplete overall.
    const start = lastLessonId ? ordered.indexOf(lastLessonId) + 1 : 0;
    nextLessonId =
      ordered.slice(Math.max(0, start)).find((id) => !completedLessonIds.has(id)) ??
      ordered.find((id) => !completedLessonIds.has(id)) ??
      null;
  }

  return {
    courseId: structure.courseId,
    percent: itemsTotal === 0 ? 0 : Math.round((itemsCompleted / itemsTotal) * 100),
    itemsTotal,
    itemsCompleted,
    lessonsTotal,
    lessonsCompleted,
    quizzesTotal,
    quizzesPassed,
    isComplete: itemsTotal > 0 && itemsCompleted === itemsTotal,
    completedLessonIds,
    passedQuizIds,
    modules,
    nextLessonId,
  };
}

@Injectable()
export class ProgressService {
  private readonly logger = new Logger('Progress');

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /** Published curriculum used for learner-facing progress (staff previews use the same shape). */
  async structure(courseId: string, tx?: Tx, includeUnpublished = false): Promise<CourseStructure> {
    const db = tx ?? this.prisma;
    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        completionRule: true,
        certificateEnabled: true,
        modules: {
          where: includeUnpublished ? {} : { isPublished: true },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            access: true,
            isPublished: true,
            prerequisiteQuizId: true,
            lessons: {
              where: includeUnpublished ? {} : { isPublished: true },
              orderBy: { position: 'asc' },
              select: { id: true, title: true, position: true, estimatedMinutes: true },
            },
            quizzes: {
              where: includeUnpublished ? {} : { isPublished: true },
              orderBy: { createdAt: 'asc' },
              select: { id: true, title: true, lessonId: true, passingScore: true },
            },
          },
        },
        quizzes: {
          where: { moduleId: null, ...(includeUnpublished ? {} : { isPublished: true }) },
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, lessonId: true, passingScore: true },
        },
      },
    });
    return {
      courseId: course.id,
      completionRule: course.completionRule,
      certificateEnabled: course.certificateEnabled,
      modules: course.modules,
      courseQuizzes: course.quizzes.filter((q) => !q.lessonId),
    };
  }

  async progressFor(userId: string, courseId: string, tx?: Tx, structure?: CourseStructure): Promise<CourseProgress> {
    const db = tx ?? this.prisma;
    const s = structure ?? (await this.structure(courseId, tx));
    const lessonIds = s.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const [done, passes, enrollment] = await Promise.all([
      db.lessonProgress.findMany({ where: { userId, lessonId: { in: lessonIds }, completedAt: { not: null } }, select: { lessonId: true } }),
      db.quizPass.findMany({ where: { userId, quiz: { courseId } }, select: { quizId: true } }),
      db.courseEnrollment.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { lastLessonId: true } }),
    ]);
    return computeProgress(s, new Set(done.map((d) => d.lessonId)), new Set(passes.map((p) => p.quizId)), enrollment?.lastLessonId ?? null);
  }

  /** Ensures an enrollment exists (learning a free module implicitly enrols). */
  async ensureEnrollment(userId: string, courseId: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    return db.courseEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
  }

  async touchLesson(userId: string, courseId: string, lessonId: string) {
    await this.ensureEnrollment(userId, courseId);
    await this.prisma.$transaction([
      this.prisma.courseEnrollment.update({
        where: { userId_courseId: { userId, courseId } },
        data: { lastLessonId: lessonId, lastActivityAt: new Date() },
      }),
      this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      }),
    ]);
  }

  async completeLesson(userId: string, courseId: string, lessonId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureEnrollment(userId, courseId, tx);
      await tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, completedAt: new Date() },
        update: { completedAt: new Date() },
      });
      await tx.courseEnrollment.update({
        where: { userId_courseId: { userId, courseId } },
        data: { lastLessonId: lessonId, lastActivityAt: new Date() },
      });
      return this.evaluateCompletion(userId, courseId, tx);
    });
  }

  /**
   * Re-evaluates completion inside the caller's transaction. Marks the
   * enrollment complete and issues the certificate exactly once.
   */
  async evaluateCompletion(userId: string, courseId: string, tx: Tx) {
    const structure = await this.structure(courseId, tx);
    const progress = await this.progressFor(userId, courseId, tx, structure);
    let certificate: { id: string; serial: string } | null = null;
    let newlyCompleted = false;
    if (progress.isComplete) {
      const claimed = await tx.courseEnrollment.updateMany({
        where: { userId, courseId, completedAt: null },
        data: { completedAt: new Date() },
      });
      newlyCompleted = claimed.count > 0;
      const globalCertificates = await this.settings.get('courses.certificatesEnabled', tx);
      if (structure.certificateEnabled && globalCertificates) {
        certificate = await this.certificates.issueIfEligible(userId, courseId, tx, progress);
      }
      if (newlyCompleted) this.logger.log({ msg: 'course completed', userId, courseId });
    }
    return { progress: serialiseProgress(progress), newlyCompleted, certificate };
  }
}

export function serialiseProgress(p: CourseProgress) {
  return {
    courseId: p.courseId,
    percent: p.percent,
    itemsTotal: p.itemsTotal,
    itemsCompleted: p.itemsCompleted,
    lessonsTotal: p.lessonsTotal,
    lessonsCompleted: p.lessonsCompleted,
    quizzesTotal: p.quizzesTotal,
    quizzesPassed: p.quizzesPassed,
    isComplete: p.isComplete,
    nextLessonId: p.nextLessonId,
    modules: p.modules,
  };
}
