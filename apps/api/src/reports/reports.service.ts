import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../payments/finance.service';
import { ProgressService } from '../learning/progress.service';
import { AccessService } from '../learning/access.service';
import type { AuthUser } from '../common/auth-user';

const DAY = 86_400_000;
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** All figures are computed from live database rows; nothing is cached or estimated. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly progress: ProgressService,
    private readonly access: AccessService,
  ) {}

  async adminOverview() {
    const since30 = new Date(Date.now() - 30 * DAY);
    const since7 = new Date(Date.now() - 7 * DAY);
    const stale = new Date(Date.now() - 2 * DAY);
    const [
      learners,
      activeLearners,
      creators,
      published,
      submittedCourses,
      pendingApplications,
      pendingPrices,
      submittedRoadmaps,
      txByStatus,
      revenue30,
      failed7,
      duplicates,
      staleThreads,
      recent,
      newUsers30,
    ] = await Promise.all([
      this.prisma.user.count({ where: { roles: { some: { role: { key: 'LEARNER' } } } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { roles: { some: { role: { key: 'CREATOR' } } } } }),
      this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.course.findMany({ where: { status: 'SUBMITTED' }, orderBy: { submittedAt: 'asc' }, take: 5, select: { id: true, title: true, submittedAt: true, creator: { select: { fullName: true } } } }),
      this.prisma.creatorApplication.count({ where: { status: 'PENDING' } }),
      this.prisma.coursePriceProposal.count({ where: { status: 'PENDING' } }),
      this.prisma.roadmap.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.paymentTransaction.groupBy({ by: ['status'], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { amount: true }, orderBy: { status: 'asc' } }),
      this.prisma.financialLedgerEntry.aggregate({ where: { type: { in: ['SALE', 'REFUND'] }, createdAt: { gte: since30 } }, _sum: { amount: true } }),
      this.prisma.paymentTransaction.count({ where: { status: 'FAILED', createdAt: { gte: since7 } } }),
      this.prisma.paymentTransaction.count({ where: { status: 'SUCCESSFUL', failureReason: { startsWith: 'DUPLICATE_PURCHASE' } } }),
      this.prisma.supportThread.count({ where: { status: 'WAITING_FOR_RESPONSE', lastMessageAt: { lt: stale } } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { actor: { select: { fullName: true } } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    ]);
    const submittedCount = await this.prisma.course.count({ where: { status: 'SUBMITTED' } });
    return {
      totals: { learners, activeLearners, creators, publishedCourses: published, newUsers30 },
      pending: { courses: submittedCount, creatorApplications: pendingApplications, priceProposals: pendingPrices, roadmaps: submittedRoadmaps },
      reviewQueue: submittedCourses,
      transactions30: txByStatus.map((t) => ({ status: t.status, count: (t._count as { _all: number })._all, amount: Number((t._sum as { amount: Prisma.Decimal | null }).amount ?? 0) })),
      netRevenue30: Number(revenue30._sum.amount ?? 0),
      attention: [
        submittedCount && { kind: 'courses', count: submittedCount, label: `${plural(submittedCount, 'course')} waiting for review`, href: '/admin/courses?status=SUBMITTED' },
        pendingApplications && { kind: 'creators', count: pendingApplications, label: plural(pendingApplications, 'creator application'), href: '/admin/creators' },
        pendingPrices && { kind: 'pricing', count: pendingPrices, label: plural(pendingPrices, 'price proposal'), href: '/admin/courses?pricing=pending' },
        submittedRoadmaps && { kind: 'roadmaps', count: submittedRoadmaps, label: `${plural(submittedRoadmaps, 'roadmap')} submitted`, href: '/admin/roadmaps?status=SUBMITTED' },
        failed7 && { kind: 'payments', count: failed7, label: `${plural(failed7, 'failed payment')} this week`, href: '/admin/payments?status=FAILED' },
        duplicates && { kind: 'duplicates', count: duplicates, label: `${plural(duplicates, 'duplicate purchase')} to refund`, href: '/admin/payments?flagged=true' },
        staleThreads && { kind: 'support', count: staleThreads, label: `${plural(staleThreads, 'question')} waiting over 48h`, href: '/admin/support?status=WAITING_FOR_RESPONSE' },
      ].filter(Boolean),
      recentActivity: recent,
    };
  }

  async learnerReport() {
    const since = new Date(Date.now() - 30 * DAY);
    const courses = await this.prisma.course.findMany({
      where: { status: { in: ['PUBLISHED', 'APPROVED', 'ARCHIVED'] } },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        status: true,
        creator: { select: { fullName: true } },
        _count: { select: { enrollments: true, certificates: true } },
      },
    });
    const completions = await this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { completedAt: { not: null } }, _count: { _all: true } });
    const quizStats = await this.prisma.$queryRaw<{ courseId: string; attempts: bigint; avg: number | null; passRate: number | null }[]>`
      SELECT q."courseId" AS "courseId", COUNT(a.id) AS attempts, AVG(a."scorePercent")::float AS avg,
             AVG(CASE WHEN a.passed THEN 1 ELSE 0 END)::float AS "passRate"
      FROM "QuizAttempt" a JOIN "Quiz" q ON q.id = a."quizId"
      WHERE a.status = 'SUBMITTED'
      GROUP BY q."courseId"`;
    const daily = await this.prisma.$queryRaw<{ day: Date; enrollments: bigint; lessons: bigint }[]>`
      SELECT d.day,
        (SELECT COUNT(*) FROM "CourseEnrollment" e WHERE date_trunc('day', e."enrolledAt") = d.day) AS enrollments,
        (SELECT COUNT(*) FROM "LessonProgress" p WHERE date_trunc('day', p."completedAt") = d.day) AS lessons
      FROM generate_series(date_trunc('day', ${since}::timestamptz), date_trunc('day', now()), interval '1 day') AS d(day)
      ORDER BY d.day`;
    const [certificates, activeLearners] = await Promise.all([
      this.prisma.certificate.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.courseEnrollment.findMany({ where: { lastActivityAt: { gte: since } }, distinct: ['userId'], select: { userId: true } }),
    ]);
    return {
      courses: courses.map((c) => {
        const completed = completions.find((x) => x.courseId === c.id)?._count._all ?? 0;
        const q = quizStats.find((s) => s.courseId === c.id);
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          creator: c.creator.fullName,
          enrollments: c._count.enrollments,
          completions: completed,
          completionRate: c._count.enrollments ? Math.round((completed / c._count.enrollments) * 100) : 0,
          certificates: c._count.certificates,
          quizAttempts: Number(q?.attempts ?? 0),
          averageScore: q?.avg !== null && q?.avg !== undefined ? Math.round(q.avg) : null,
          passRate: q?.passRate !== null && q?.passRate !== undefined ? Math.round(q.passRate * 100) : null,
        };
      }),
      daily: daily.map((d) => ({ day: d.day, enrollments: Number(d.enrollments), lessons: Number(d.lessons) })),
      certificates: Object.fromEntries(certificates.map((c) => [c.status, c._count._all])),
      activeLearners30: activeLearners.length,
    };
  }

  async creatorDashboard(user: AuthUser) {
    const courses = await this.prisma.course.findMany({
      where: { creatorId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        approvedPrice: true,
        _count: { select: { enrollments: true, certificates: true } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, feedback: true, createdAt: true } },
      },
    });
    const courseIds = courses.map((c) => c.id);
    const [completions, quizzes, awaiting, recentEnrollments, recentAttempts, earnings] = await Promise.all([
      this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, completedAt: { not: null } }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ quizId: string; title: string; courseTitle: string; attempts: bigint; avg: number | null; passRate: number | null }[]>`
        SELECT q.id AS "quizId", q.title, c.title AS "courseTitle", COUNT(a.id) AS attempts,
               AVG(a."scorePercent")::float AS avg, AVG(CASE WHEN a.passed THEN 1 ELSE 0 END)::float AS "passRate"
        FROM "Quiz" q JOIN "Course" c ON c.id = q."courseId"
        LEFT JOIN "QuizAttempt" a ON a."quizId" = q.id AND a.status = 'SUBMITTED'
        WHERE c."creatorId" = ${user.id}::uuid
        GROUP BY q.id, q.title, c.title ORDER BY attempts DESC LIMIT 12`,
      this.prisma.supportThread.findMany({
        where: { courseId: { in: courseIds }, status: { in: ['OPEN', 'WAITING_FOR_RESPONSE'] } },
        orderBy: { lastMessageAt: 'asc' },
        take: 8,
        select: { id: true, subject: true, lastMessageAt: true, learner: { select: { fullName: true } }, course: { select: { title: true } } },
      }),
      this.prisma.courseEnrollment.findMany({
        where: { courseId: { in: courseIds } },
        orderBy: { enrolledAt: 'desc' },
        take: 8,
        select: { enrolledAt: true, completedAt: true, user: { select: { fullName: true } }, course: { select: { title: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quiz: { courseId: { in: courseIds } }, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        select: { submittedAt: true, scorePercent: true, passed: true, user: { select: { fullName: true } }, quiz: { select: { title: true } } },
      }),
      this.finance.creatorEarnings(user.id),
    ]);
    const byStatus = courses.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
    const activity = [
      ...recentEnrollments.map((e) => ({ kind: 'enrolment', at: e.enrolledAt, text: `${e.user.fullName} enrolled in ${e.course.title}` })),
      ...recentAttempts.map((a) => ({ kind: 'quiz', at: a.submittedAt!, text: `${a.user.fullName} ${a.passed ? 'passed' : 'attempted'} ${a.quiz.title} (${a.scorePercent}%)` })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10);
    return {
      byStatus,
      courses: courses.map((c) => {
        const completed = completions.find((x) => x.courseId === c.id)?._count._all ?? 0;
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          updatedAt: c.updatedAt,
          price: c.approvedPrice ? Number(c.approvedPrice) : 0,
          enrollments: c._count.enrollments,
          completions: completed,
          certificates: c._count.certificates,
          lastReview: c.reviews[0] ?? null,
        };
      }),
      quizPerformance: quizzes.map((q) => ({ ...q, attempts: Number(q.attempts), avg: q.avg === null ? null : Math.round(q.avg), passRate: q.passRate === null ? null : Math.round(q.passRate * 100) })),
      awaitingResponse: awaiting,
      activity,
      earnings,
    };
  }

  /** Per-learner progress for one course, using the same progress service as the learner views. */
  async courseLearners(user: AuthUser, courseId: string) {
    await this.access.assertCanManageCourse(user, courseId);
    const structure = await this.progress.structure(courseId);
    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { courseId },
      orderBy: { lastActivityAt: 'desc' },
      take: 200,
      select: { userId: true, enrolledAt: true, lastActivityAt: true, completedAt: true, user: { select: { fullName: true, email: true } } },
    });
    const rows: { learner: { fullName: string; email: string }; enrolledAt: Date; lastActivityAt: Date; completedAt: Date | null; percent: number }[] = [];
    for (const e of enrollments) {
      const p = await this.progress.progressFor(e.userId, courseId, undefined, structure);
      rows.push({ learner: e.user, enrolledAt: e.enrolledAt, lastActivityAt: e.lastActivityAt, completedAt: e.completedAt, percent: p.percent });
    }
    const buckets = [0, 25, 50, 75, 100].map((b, i, arr) => ({
      label: i === arr.length - 1 ? '100%' : `${b}–${arr[i + 1] - 1}%`,
      count: rows.filter((r) => (i === arr.length - 1 ? r.percent === 100 : r.percent >= b && r.percent < arr[i + 1])).length,
    }));
    return { learners: rows, distribution: buckets };
  }
}
