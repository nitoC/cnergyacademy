import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from '../learning/access.service';
import { ProgressService } from '../learning/progress.service';
import { isContentEditable } from '../courses/course-workflow';
import type { AuthUser } from '../common/auth-user';
import { scoreAttempt } from './scoring';
import type { CreateQuizDto, QuestionDto, SubmitAttemptDto, UpdateQuizDto } from './quizzes.dto';

function validateQuestion(dto: QuestionDto) {
  const correct = dto.options.filter((o) => o.isCorrect).length;
  const type: QuestionType = dto.type ?? 'SINGLE_CHOICE';
  if (correct === 0) throw new BadRequestException({ code: 'INVALID_QUESTION', message: 'Mark at least one correct option' });
  if (type === 'SINGLE_CHOICE' && correct !== 1) throw new BadRequestException({ code: 'INVALID_QUESTION', message: 'Single-choice questions need exactly one correct option' });
  const labels = new Set(dto.options.map((o) => o.label.toLowerCase()));
  if (labels.size !== dto.options.length) throw new BadRequestException({ code: 'INVALID_QUESTION', message: 'Options must be distinct' });
  return type;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly progress: ProgressService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Authoring ─────────────

  private async manageableQuiz(user: AuthUser, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Quiz not found' });
    const { course } = await this.access.assertCanManageCourse(user, quiz.courseId);
    return { quiz, course };
  }

  private assertEditable(status: Parameters<typeof isContentEditable>[0]) {
    if (!isContentEditable(status)) throw new ConflictException({ code: 'COURSE_LOCKED', message: 'Content is locked while the course is under review or archived' });
  }

  private async resolvePlacement(courseId: string, moduleId?: string | null, lessonId?: string | null) {
    if (lessonId) {
      const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
      if (!lesson || lesson.module.courseId !== courseId) throw new BadRequestException({ code: 'INVALID_LESSON', message: 'Lesson must belong to this course' });
      return { moduleId: lesson.moduleId, lessonId };
    }
    if (moduleId) {
      const module = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
      if (!module || module.courseId !== courseId) throw new BadRequestException({ code: 'INVALID_MODULE', message: 'Module must belong to this course' });
      return { moduleId, lessonId: null };
    }
    return { moduleId: null, lessonId: null };
  }

  async create(user: AuthUser, courseId: string, dto: CreateQuizDto) {
    const { course } = await this.access.assertCanManageCourse(user, courseId);
    this.assertEditable(course.status);
    const placement = await this.resolvePlacement(courseId, dto.moduleId, dto.lessonId);
    const quiz = await this.prisma.quiz.create({
      data: {
        courseId,
        ...placement,
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore ?? 70,
        maxAttempts: dto.maxAttempts ?? null,
        cooldownMinutes: dto.cooldownMinutes ?? 0,
        allowNavigation: dto.allowNavigation ?? true,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        feedbackPolicy: dto.feedbackPolicy ?? 'FULL_EXPLANATIONS',
      },
    });
    await this.audit.record({ actorId: user.id, action: 'quiz.create', resourceType: 'Quiz', resourceId: quiz.id, metadata: { courseId } });
    return quiz;
  }

  async editorView(user: AuthUser, quizId: string) {
    await this.manageableQuiz(user, quizId);
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      include: {
        questions: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } } } },
        module: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
        course: { select: { id: true, title: true, status: true } },
        gatesModules: { select: { id: true, title: true } },
        _count: { select: { attempts: true } },
      },
    });
    const stats = await this.prisma.quizAttempt.aggregate({ where: { quizId, status: 'SUBMITTED' }, _avg: { scorePercent: true }, _count: { _all: true } });
    const passes = await this.prisma.quizPass.count({ where: { quizId } });
    return { ...quiz, stats: { attempts: stats._count._all, averageScore: stats._avg.scorePercent, passes } };
  }

  async update(user: AuthUser, quizId: string, dto: UpdateQuizDto) {
    const { quiz, course } = await this.manageableQuiz(user, quizId);
    this.assertEditable(course.status);
    const placement =
      dto.moduleId !== undefined || dto.lessonId !== undefined
        ? await this.resolvePlacement(quiz.courseId, dto.moduleId === undefined ? quiz.moduleId : dto.moduleId, dto.lessonId === undefined ? quiz.lessonId : dto.lessonId)
        : {};
    if (dto.isPublished === true) {
      const questions = await this.prisma.question.findMany({ where: { quizId }, include: { options: true } });
      if (!questions.length) throw new BadRequestException({ code: 'QUIZ_EMPTY', message: 'Add at least one question before publishing' });
      for (const q of questions) {
        if (!q.options.some((o) => o.isCorrect)) throw new BadRequestException({ code: 'INVALID_QUESTION', message: `"${q.prompt.slice(0, 40)}" has no correct option` });
      }
    }
    if (dto.isPublished === false) {
      const gating = await this.prisma.courseModule.count({ where: { prerequisiteQuizId: quizId, isPublished: true } });
      if (gating && course.status === 'PUBLISHED') {
        throw new ConflictException({ code: 'QUIZ_IS_GATE', message: 'This quiz gates a published module. Change that module first.' });
      }
    }
    return this.prisma.quiz.update({
      where: { id: quizId },
      data: {
        ...placement,
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
        maxAttempts: dto.maxAttempts,
        cooldownMinutes: dto.cooldownMinutes,
        allowNavigation: dto.allowNavigation,
        shuffleQuestions: dto.shuffleQuestions,
        feedbackPolicy: dto.feedbackPolicy,
        isPublished: dto.isPublished,
      },
    });
  }

  async remove(user: AuthUser, quizId: string) {
    const { course } = await this.manageableQuiz(user, quizId);
    this.assertEditable(course.status);
    const attempts = await this.prisma.quizAttempt.count({ where: { quizId } });
    if (attempts) throw new ConflictException({ code: 'QUIZ_HAS_ATTEMPTS', message: 'Learners have attempted this quiz. Unpublish it instead.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.courseModule.updateMany({ where: { prerequisiteQuizId: quizId }, data: { prerequisiteQuizId: null } });
      await tx.quiz.delete({ where: { id: quizId } });
      await this.audit.record({ actorId: user.id, action: 'quiz.delete', resourceType: 'Quiz', resourceId: quizId }, tx);
    });
    return { deleted: true };
  }

  async addQuestion(user: AuthUser, quizId: string, dto: QuestionDto) {
    const { course } = await this.manageableQuiz(user, quizId);
    this.assertEditable(course.status);
    const type = validateQuestion(dto);
    const max = await this.prisma.question.aggregate({ where: { quizId }, _max: { position: true } });
    return this.prisma.question.create({
      data: {
        quizId,
        type,
        prompt: dto.prompt,
        explanation: dto.explanation,
        points: dto.points ?? 1,
        position: (max._max.position ?? 0) + 1,
        options: { create: dto.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, position: i + 1 })) },
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });
  }

  async updateQuestion(user: AuthUser, questionId: string, dto: QuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const { course } = await this.manageableQuiz(user, question.quizId);
    this.assertEditable(course.status);
    const type = validateQuestion(dto);
    return this.prisma.$transaction(async (tx) => {
      // Options are replaced as a set. Past attempts keep their recorded correctness.
      await tx.questionOption.deleteMany({ where: { questionId } });
      return tx.question.update({
        where: { id: questionId },
        data: {
          type,
          prompt: dto.prompt,
          explanation: dto.explanation,
          points: dto.points ?? question.points,
          options: { create: dto.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, position: i + 1 })) },
        },
        include: { options: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async deleteQuestion(user: AuthUser, questionId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const { course } = await this.manageableQuiz(user, question.quizId);
    this.assertEditable(course.status);
    await this.prisma.question.delete({ where: { id: questionId } });
    return { deleted: true };
  }

  async reorderQuestions(user: AuthUser, quizId: string, ids: string[]) {
    const { course } = await this.manageableQuiz(user, quizId);
    this.assertEditable(course.status);
    const existing = await this.prisma.question.findMany({ where: { quizId }, select: { id: true } });
    if (existing.length !== ids.length || !existing.every((q) => ids.includes(q.id))) {
      throw new BadRequestException({ code: 'INVALID_ORDER', message: 'Provide every question exactly once' });
    }
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.question.update({ where: { id }, data: { position: i + 1 } })));
    return { ok: true };
  }

  // ───────────── Taking quizzes ─────────────

  private async attemptPolicy(userId: string, quiz: { id: string; maxAttempts: number | null; cooldownMinutes: number }) {
    const [submitted, last, pass, inProgress] = await Promise.all([
      this.prisma.quizAttempt.count({ where: { quizId: quiz.id, userId, status: 'SUBMITTED' } }),
      this.prisma.quizAttempt.findFirst({ where: { quizId: quiz.id, userId, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' } }),
      this.prisma.quizPass.findUnique({ where: { userId_quizId: { userId, quizId: quiz.id } } }),
      this.prisma.quizAttempt.findFirst({ where: { quizId: quiz.id, userId, status: 'IN_PROGRESS' } }),
    ]);
    const remaining = quiz.maxAttempts === null ? null : Math.max(0, quiz.maxAttempts - submitted);
    const cooldownUntil =
      quiz.cooldownMinutes > 0 && last?.submittedAt ? new Date(last.submittedAt.getTime() + quiz.cooldownMinutes * 60_000) : null;
    let blockedReason: string | null = null;
    if (remaining === 0) blockedReason = 'NO_ATTEMPTS_REMAINING';
    else if (cooldownUntil && cooldownUntil > new Date()) blockedReason = 'COOLDOWN';
    return { submitted, remaining, cooldownUntil, passed: !!pass, inProgressId: inProgress?.id ?? null, blockedReason };
  }

  async overview(user: AuthUser, quizId: string) {
    const { quiz, decision } = await this.access.assertQuizAccess(user, quizId);
    const policy = await this.attemptPolicy(user.id, quiz);
    const [questionCount, history, course] = await Promise.all([
      this.prisma.question.count({ where: { quizId } }),
      this.prisma.quizAttempt.findMany({
        where: { quizId, userId: user.id, status: 'SUBMITTED' },
        orderBy: { attemptNumber: 'desc' },
        select: { id: true, attemptNumber: true, scorePercent: true, passed: true, submittedAt: true },
      }),
      this.prisma.course.findUniqueOrThrow({ where: { id: quiz.courseId }, select: { id: true, title: true, slug: true } }),
    ]);
    const gates = await this.prisma.courseModule.findMany({ where: { prerequisiteQuizId: quizId }, select: { id: true, title: true } });
    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        cooldownMinutes: quiz.cooldownMinutes,
        allowNavigation: quiz.allowNavigation,
        feedbackPolicy: quiz.feedbackPolicy,
        questionCount,
      },
      course,
      module: quiz.module ? { id: quiz.module.id, title: quiz.module.title } : null,
      unlocks: gates,
      preview: decision.preview,
      ...policy,
      history,
    };
  }

  private async attemptPayload(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { quiz: { select: { id: true, title: true, allowNavigation: true, passingScore: true, courseId: true } } },
    });
    const questions = await this.prisma.question.findMany({
      where: { id: { in: attempt.questionOrder } },
      // Correct flags and explanations are deliberately not selected.
      select: { id: true, type: true, prompt: true, points: true, options: { orderBy: { position: 'asc' }, select: { id: true, label: true } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      id: attempt.id,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      quiz: attempt.quiz,
      questions: attempt.questionOrder.map((id) => byId.get(id)).filter(Boolean),
    };
  }

  async start(user: AuthUser, quizId: string) {
    const { quiz, decision } = await this.access.assertQuizAccess(user, quizId);
    const policy = await this.attemptPolicy(user.id, quiz);
    if (policy.inProgressId) return this.attemptPayload(policy.inProgressId);
    if (policy.blockedReason === 'NO_ATTEMPTS_REMAINING') {
      throw new ForbiddenException({ code: 'NO_ATTEMPTS_REMAINING', message: 'You have used every attempt for this quiz' });
    }
    if (policy.blockedReason === 'COOLDOWN') {
      throw new ForbiddenException({ code: 'COOLDOWN', message: `You can retry after ${policy.cooldownUntil!.toISOString()}`, details: { cooldownUntil: policy.cooldownUntil } });
    }
    const questions = await this.prisma.question.findMany({ where: { quizId }, orderBy: { position: 'asc' }, select: { id: true } });
    if (!questions.length) throw new ConflictException({ code: 'QUIZ_EMPTY', message: 'This quiz has no questions yet' });
    const order = quiz.shuffleQuestions ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);
    const attemptNumber = (await this.prisma.quizAttempt.count({ where: { quizId, userId: user.id } })) + 1;
    try {
      const attempt = await this.prisma.quizAttempt.create({ data: { quizId, userId: user.id, attemptNumber, questionOrder: order } });
      if (!decision.preview) await this.progress.ensureEnrollment(user.id, quiz.courseId);
      return this.attemptPayload(attempt.id);
    } catch (err) {
      // Concurrent start: the unique (quiz, user, attemptNumber) rejected the duplicate.
      const existing = await this.prisma.quizAttempt.findFirst({ where: { quizId, userId: user.id, status: 'IN_PROGRESS' } });
      if (existing) return this.attemptPayload(existing.id);
      throw err;
    }
  }

  async getAttempt(user: AuthUser, attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== user.id) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attempt not found' });
    if (attempt.status === 'IN_PROGRESS') {
      await this.access.assertQuizAccess(user, attempt.quizId);
      return this.attemptPayload(attemptId);
    }
    return this.result(attemptId);
  }

  /** Result view filtered by the quiz's feedback policy. */
  private async result(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        quiz: { select: { id: true, title: true, passingScore: true, feedbackPolicy: true, courseId: true, maxAttempts: true } },
        answers: true,
      },
    });
    const policy = attempt.quiz.feedbackPolicy;
    const questions = await this.prisma.question.findMany({
      where: { id: { in: attempt.questionOrder } },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const answers = new Map(attempt.answers.map((a) => [a.questionId, a]));
    const unlocked = attempt.passed
      ? await this.prisma.courseModule.findMany({ where: { prerequisiteQuizId: attempt.quizId }, select: { id: true, title: true } })
      : [];
    return {
      id: attempt.id,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      scorePercent: attempt.scorePercent,
      pointsEarned: attempt.pointsEarned,
      pointsTotal: attempt.pointsTotal,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
      quiz: attempt.quiz,
      feedbackPolicy: policy,
      unlockedModules: unlocked,
      review:
        policy === 'SCORE_ONLY'
          ? []
          : attempt.questionOrder.map((qid) => {
              const q = byId.get(qid);
              const a = answers.get(qid);
              return {
                questionId: qid,
                prompt: q?.prompt ?? '(question removed)',
                selectedOptionIds: a?.selectedOptionIds ?? [],
                isCorrect: a?.isCorrect ?? false,
                options: (q?.options ?? []).map((o) => ({
                  id: o.id,
                  label: o.label,
                  ...(policy === 'FULL_EXPLANATIONS' ? { isCorrect: o.isCorrect } : {}),
                })),
                explanation: policy === 'FULL_EXPLANATIONS' ? q?.explanation ?? null : null,
              };
            }),
    };
  }

  async submit(user: AuthUser, attemptId: string, dto: SubmitAttemptDto) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== user.id) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attempt not found' });
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException({ code: 'ATTEMPT_CLOSED', message: 'This attempt has already been submitted' });
    const { quiz, decision } = await this.access.assertQuizAccess(user, attempt.quizId);

    const questions = await this.prisma.question.findMany({
      where: { id: { in: attempt.questionOrder } },
      select: { id: true, type: true, points: true, options: { select: { id: true, isCorrect: true } } },
    });
    const submitted: Record<string, string[]> = {};
    for (const a of dto.answers) submitted[a.questionId] = a.optionIds;
    const result = scoreAttempt(questions, submitted, quiz.passingScore);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quizAttempt.updateMany({
        where: { id: attemptId, status: 'IN_PROGRESS' },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          scorePercent: result.scorePercent,
          pointsEarned: result.pointsEarned,
          pointsTotal: result.pointsTotal,
          passed: result.passed,
        },
      });
      if (!claimed.count) throw new ConflictException({ code: 'ATTEMPT_CLOSED', message: 'This attempt has already been submitted' });
      await tx.quizAttemptAnswer.createMany({ data: result.answers.map((a) => ({ attemptId, ...a })) });
      let completion = null;
      if (!decision.preview) {
        if (result.passed) {
          await tx.quizPass.upsert({
            where: { userId_quizId: { userId: user.id, quizId: quiz.id } },
            create: { userId: user.id, quizId: quiz.id, attemptId },
            update: {},
          });
        }
        await tx.courseEnrollment.updateMany({ where: { userId: user.id, courseId: quiz.courseId }, data: { lastActivityAt: new Date() } });
        completion = await this.progress.evaluateCompletion(user.id, quiz.courseId, tx);
        await this.notifications.notify(
          user.id,
          {
            type: 'quiz.result',
            title: `${result.passed ? 'Passed' : 'Not passed'}: ${quiz.title}`,
            body: `You scored ${result.scorePercent}% (pass mark ${quiz.passingScore}%).`,
            link: `/learn/quizzes/${quiz.id}/attempts/${attemptId}`,
          },
          tx,
        );
      }
      return completion;
    });
    return { ...(await this.result(attemptId)), courseProgress: outcome?.progress ?? null, certificate: outcome?.certificate ?? null };
  }
}
