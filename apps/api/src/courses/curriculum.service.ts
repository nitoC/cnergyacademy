import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { AccessService } from '../learning/access.service';
import { PREREQUISITE_POLICIES } from '../learning/access.policy';
import type { AuthUser } from '../common/auth-user';
import { isContentEditable } from './course-workflow';
import { LessonContentError, estimateReadingMinutes, normaliseLessonContent } from './lesson-content';
import type { CreateLessonDto, CreateModuleDto, UpdateLessonDto, UpdateModuleDto } from './courses.dto';

@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  private async editableCourse(user: AuthUser, courseId: string, tx?: Tx) {
    const { course } = await this.access.assertCanManageCourse(user, courseId, tx);
    if (!isContentEditable(course.status)) {
      throw new ConflictException({ code: 'COURSE_LOCKED', message: 'Content is locked while the course is under review or archived' });
    }
    return course;
  }

  private async moduleWithCourse(moduleId: string) {
    const module = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!module) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Module not found' });
    return module;
  }

  /** A prerequisite quiz must belong to the same course and must not live inside the module it gates. */
  private async validatePrerequisite(courseId: string, moduleId: string | null, access: string, quizId: string | null | undefined) {
    if (!quizId) return;
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId }, include: { lesson: true } });
    if (!quiz || quiz.courseId !== courseId) throw new BadRequestException({ code: 'INVALID_PREREQUISITE', message: 'Prerequisite quiz must belong to this course' });
    const quizModule = quiz.moduleId ?? quiz.lesson?.moduleId ?? null;
    if (moduleId && quizModule === moduleId) {
      throw new BadRequestException({ code: 'INVALID_PREREQUISITE', message: 'A module cannot be gated by one of its own quizzes' });
    }
    if (!PREREQUISITE_POLICIES.includes(access as never)) {
      throw new BadRequestException({ code: 'INVALID_PREREQUISITE', message: 'Choose a prerequisite access policy to attach a prerequisite quiz' });
    }
  }

  // ─── modules ───

  async createModule(user: AuthUser, courseId: string, dto: CreateModuleDto) {
    await this.editableCourse(user, courseId);
    const access = dto.access ?? 'FREE';
    await this.validatePrerequisite(courseId, null, access, dto.prerequisiteQuizId);
    const max = await this.prisma.courseModule.aggregate({ where: { courseId }, _max: { position: true } });
    const module = await this.prisma.courseModule.create({
      data: {
        courseId,
        title: dto.title,
        summary: dto.summary,
        access,
        prerequisiteQuizId: dto.prerequisiteQuizId ?? null,
        isPublished: dto.isPublished ?? true,
        position: (max._max.position ?? 0) + 1,
      },
    });
    await this.audit.record({ actorId: user.id, action: 'module.create', resourceType: 'CourseModule', resourceId: module.id, metadata: { courseId } });
    return module;
  }

  async updateModule(user: AuthUser, moduleId: string, dto: UpdateModuleDto) {
    const module = await this.moduleWithCourse(moduleId);
    await this.editableCourse(user, module.courseId);
    const access = dto.access ?? module.access;
    let prerequisiteQuizId = dto.prerequisiteQuizId === undefined ? module.prerequisiteQuizId : dto.prerequisiteQuizId;
    // Switching to a policy without a prerequisite drops the quiz link.
    if (!PREREQUISITE_POLICIES.includes(access)) prerequisiteQuizId = null;
    await this.validatePrerequisite(module.courseId, moduleId, access, prerequisiteQuizId);
    const updated = await this.prisma.courseModule.update({
      where: { id: moduleId },
      data: { title: dto.title, summary: dto.summary, access, prerequisiteQuizId, isPublished: dto.isPublished },
    });
    if (access !== module.access || prerequisiteQuizId !== module.prerequisiteQuizId) {
      await this.audit.record({
        actorId: user.id,
        action: 'module.access.update',
        resourceType: 'CourseModule',
        resourceId: moduleId,
        metadata: { from: module.access, to: access, prerequisiteQuizId },
      });
    }
    return updated;
  }

  async deleteModule(user: AuthUser, moduleId: string) {
    const module = await this.moduleWithCourse(moduleId);
    const course = await this.editableCourse(user, module.courseId);
    const progressRows = await this.prisma.lessonProgress.count({ where: { lesson: { moduleId } } });
    if (course.status === 'PUBLISHED' && progressRows > 0) {
      throw new ConflictException({ code: 'MODULE_IN_USE', message: 'Learners have progress in this module. Unpublish it instead of deleting.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.courseModule.updateMany({ where: { prerequisiteQuiz: { moduleId } }, data: { prerequisiteQuizId: null } });
      await tx.quiz.deleteMany({ where: { moduleId } });
      await tx.courseModule.delete({ where: { id: moduleId } });
      await this.compactModules(tx, module.courseId);
      await this.audit.record({ actorId: user.id, action: 'module.delete', resourceType: 'CourseModule', resourceId: moduleId, metadata: { courseId: module.courseId, title: module.title } }, tx);
    });
    return { deleted: true };
  }

  private async compactModules(tx: Tx, courseId: string) {
    const modules = await tx.courseModule.findMany({ where: { courseId }, orderBy: { position: 'asc' }, select: { id: true } });
    for (const [i, m] of modules.entries()) await tx.courseModule.update({ where: { id: m.id }, data: { position: i + 1 } });
  }

  async reorderModules(user: AuthUser, courseId: string, ids: string[]) {
    await this.editableCourse(user, courseId);
    const existing = await this.prisma.courseModule.findMany({ where: { courseId }, select: { id: true } });
    if (existing.length !== ids.length || !existing.every((m) => ids.includes(m.id))) {
      throw new BadRequestException({ code: 'INVALID_ORDER', message: 'Provide every module of this course exactly once' });
    }
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.courseModule.update({ where: { id }, data: { position: i + 1 } })));
    return { ok: true };
  }

  // ─── lessons ───

  private content(input: unknown[] | undefined) {
    if (input === undefined) return undefined;
    try {
      return normaliseLessonContent(input);
    } catch (err) {
      if (err instanceof LessonContentError) throw new BadRequestException({ code: 'INVALID_CONTENT', message: err.message });
      throw err;
    }
  }

  async createLesson(user: AuthUser, moduleId: string, dto: CreateLessonDto) {
    const module = await this.moduleWithCourse(moduleId);
    const course = await this.editableCourse(user, module.courseId);
    const content = this.content(dto.content) ?? [];
    const max = await this.prisma.lesson.aggregate({ where: { moduleId }, _max: { position: true } });
    const lesson = await this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        summary: dto.summary,
        content: content as unknown as Prisma.InputJsonValue,
        estimatedMinutes: dto.estimatedMinutes ?? estimateReadingMinutes(content),
        isPublished: dto.isPublished ?? true,
        position: (max._max.position ?? 0) + 1,
      },
    });
    await this.audit.record({ actorId: user.id, action: 'lesson.create', resourceType: 'Lesson', resourceId: lesson.id, metadata: { moduleId } });
    if (course.status === 'PUBLISHED' && lesson.isPublished && module.isPublished) await this.announceNewLesson(course, lesson.title);
    return lesson;
  }

  private async announceNewLesson(course: { id: string; title: string; slug: string }, lessonTitle: string) {
    if (!(await this.settings.get('notifications.courseActivity'))) return;
    const learners = await this.prisma.courseEnrollment.findMany({ where: { courseId: course.id, completedAt: null }, select: { userId: true } });
    await this.notifications.notify(learners.map((l) => l.userId), {
      type: 'course.activity',
      title: `New lesson in ${course.title}`,
      body: lessonTitle,
      link: `/learn/courses/${course.id}`,
    });
  }

  async getLessonForEditor(user: AuthUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: { select: { id: true, title: true, courseId: true } } } });
    if (!lesson) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    await this.access.assertCanManageCourse(user, lesson.module.courseId);
    return lesson;
  }

  async updateLesson(user: AuthUser, lessonId: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    await this.editableCourse(user, lesson.module.courseId);
    let position: number | undefined;
    if (dto.moduleId && dto.moduleId !== lesson.moduleId) {
      const target = await this.prisma.courseModule.findUnique({ where: { id: dto.moduleId } });
      if (!target || target.courseId !== lesson.module.courseId) throw new BadRequestException({ code: 'INVALID_MODULE', message: 'Target module must belong to the same course' });
      const max = await this.prisma.lesson.aggregate({ where: { moduleId: dto.moduleId }, _max: { position: true } });
      position = (max._max.position ?? 0) + 1;
    }
    const content = this.content(dto.content);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: dto.title,
        summary: dto.summary,
        content: content as unknown as Prisma.InputJsonValue | undefined,
        estimatedMinutes: dto.estimatedMinutes,
        isPublished: dto.isPublished,
        moduleId: dto.moduleId,
        position,
      },
    });
  }

  async deleteLesson(user: AuthUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    const course = await this.editableCourse(user, lesson.module.courseId);
    const progress = await this.prisma.lessonProgress.count({ where: { lessonId } });
    if (course.status === 'PUBLISHED' && progress > 0) {
      throw new ConflictException({ code: 'LESSON_IN_USE', message: 'Learners have progress in this lesson. Unpublish it instead of deleting.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.delete({ where: { id: lessonId } });
      const rest = await tx.lesson.findMany({ where: { moduleId: lesson.moduleId }, orderBy: { position: 'asc' }, select: { id: true } });
      for (const [i, l] of rest.entries()) await tx.lesson.update({ where: { id: l.id }, data: { position: i + 1 } });
      await this.audit.record({ actorId: user.id, action: 'lesson.delete', resourceType: 'Lesson', resourceId: lessonId, metadata: { title: lesson.title } }, tx);
    });
    return { deleted: true };
  }

  async reorderLessons(user: AuthUser, moduleId: string, ids: string[]) {
    const module = await this.moduleWithCourse(moduleId);
    await this.editableCourse(user, module.courseId);
    const existing = await this.prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
    if (existing.length !== ids.length || !existing.every((l) => ids.includes(l.id))) {
      throw new BadRequestException({ code: 'INVALID_ORDER', message: 'Provide every lesson of this module exactly once' });
    }
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.lesson.update({ where: { id }, data: { position: i + 1 } })));
    return { ok: true };
  }
}
