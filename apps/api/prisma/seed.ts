/**
 * Development seed. Safe to run repeatedly: every record is looked up by a
 * natural key (email, slug, reference) before being created, and content is
 * only generated for courses that do not exist yet.
 *
 * Never run against production — the credentials below are public.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_KEYS, ROLE_PERMISSIONS, RoleKey } from '../src/common/permissions';
import { slugify } from '../src/common/util';
import { COURSES, SUBJECTS } from './seed-content';

const prisma = new PrismaClient();
export const SEED_PASSWORD = 'Academy2026!dev';

const USERS: { email: string; fullName: string; roles: RoleKey[]; bio?: string }[] = [
  { email: 'admin@academy.local', fullName: 'Ifeoma Nwosu', roles: ['LEARNER', 'ADMIN'], bio: 'Platform operations lead.' },
  { email: 'ada.okafor@academy.local', fullName: 'Ada Okafor', roles: ['LEARNER', 'CREATOR'], bio: 'Staff engineer. Twelve years building payment and logistics backends in Lagos and London.' },
  { email: 'tunde.bello@academy.local', fullName: 'Tunde Bello', roles: ['LEARNER', 'CREATOR'], bio: 'Security engineer and incident responder.' },
  { email: 'grace.mensah@academy.local', fullName: 'Grace Mensah', roles: ['LEARNER', 'CREATOR'], bio: 'Technology consultant working with banks across West Africa.' },
  { email: 'kemi.adeyemi@academy.local', fullName: 'Kemi Adeyemi', roles: ['LEARNER', 'MENTOR'], bio: 'Backend mentor. Patient with questions, impatient with flaky tests.' },
  { email: 'chidi.eze@academy.local', fullName: 'Chidi Eze', roles: ['LEARNER'] },
  { email: 'amaka.obi@academy.local', fullName: 'Amaka Obi', roles: ['LEARNER'] },
  { email: 'femi.ajayi@academy.local', fullName: 'Femi Ajayi', roles: ['LEARNER'] },
  { email: 'zainab.musa@academy.local', fullName: 'Zainab Musa', roles: ['LEARNER'] },
];

async function main() {
  console.log('Seeding roles and permissions…');
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const permissions = await prisma.permission.findMany();
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.upsert({ where: { key }, create: { key, ...ROLE_DESCRIPTIONS[key] }, update: ROLE_DESCRIPTIONS[key] });
    const wanted = permissions.filter((p) => ROLE_PERMISSIONS[key].includes(p.key as never));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted.map((p) => p.id) } } });
    await prisma.rolePermission.createMany({ data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
  }
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));

  console.log('Seeding users…');
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const users = new Map<string, string>();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, fullName: u.fullName, bio: u.bio, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
      update: {},
    });
    users.set(u.email, user.id);
    await prisma.userRole.createMany({ data: u.roles.map((r) => ({ userId: user.id, roleId: roles.get(r)! })), skipDuplicates: true });
  }
  const admin = users.get('admin@academy.local')!;

  if (!(await prisma.creatorApplication.findFirst({ where: { userId: users.get('zainab.musa@academy.local')! } }))) {
    await prisma.creatorApplication.create({
      data: {
        userId: users.get('zainab.musa@academy.local')!,
        headline: 'Data analyst teaching spreadsheet-to-SQL transitions',
        expertise: 'Six years of analytics at a fintech; I run internal SQL training for non-engineers.',
        portfolioUrl: 'https://example.com/zainab',
        motivation: 'I want to publish a course that helps finance teams move from fragile spreadsheets to reproducible SQL queries.',
      },
    });
  }

  console.log('Seeding subjects and categories…');
  const categories = new Map<string, string>();
  const subjects = new Map<string, string>();
  for (const [i, s] of SUBJECTS.entries()) {
    const subject = await prisma.subject.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, name: s.name, description: s.description, accentColor: s.accent, sortOrder: i + 1 },
      update: {},
    });
    subjects.set(s.slug, subject.id);
    for (const [j, name] of s.categories.entries()) {
      const slug = slugify(name);
      const c = await prisma.category.upsert({
        where: { subjectId_slug: { subjectId: subject.id, slug } },
        create: { subjectId: subject.id, name, slug, sortOrder: j + 1 },
        update: {},
      });
      categories.set(`${s.slug}/${slug}`, c.id);
    }
  }

  console.log('Seeding courses…');
  const courseIds = new Map<string, string>();
  for (const spec of COURSES) {
    const existing = await prisma.course.findUnique({ where: { slug: spec.slug } });
    if (existing) {
      courseIds.set(spec.slug, existing.id);
      continue;
    }
    const creatorId = users.get(spec.creator)!;
    const now = new Date();
    const course = await prisma.course.create({
      data: {
        slug: spec.slug,
        title: spec.title,
        shortDescription: spec.shortDescription,
        description: spec.description,
        subjectId: subjects.get(spec.subject)!,
        categoryId: categories.get(`${spec.subject}/${spec.category}`),
        creatorId,
        difficulty: spec.difficulty,
        estimatedMinutes: spec.minutes,
        learningOutcomes: spec.outcomes,
        proposedPrice: spec.price,
        approvedPrice: spec.status === 'PUBLISHED' ? spec.price : null,
        status: spec.status,
        coverPattern: spec.cover,
        submittedAt: spec.status !== 'DRAFT' ? now : null,
        approvedAt: spec.status === 'PUBLISHED' ? now : null,
        publishedAt: spec.status === 'PUBLISHED' ? new Date(now.getTime() - Math.random() * 30 * 86_400_000) : null,
      },
    });
    courseIds.set(spec.slug, course.id);
    if (spec.price !== null) {
      await prisma.coursePriceProposal.create({
        data: {
          courseId: course.id,
          proposedById: creatorId,
          amount: spec.price,
          status: spec.status === 'PUBLISHED' ? 'APPROVED' : 'PENDING',
          decidedById: spec.status === 'PUBLISHED' ? admin : null,
          decidedAt: spec.status === 'PUBLISHED' ? now : null,
        },
      });
    }
    if (spec.status === 'SUBMITTED') {
      await prisma.coursePriceProposal.create({ data: { courseId: course.id, proposedById: creatorId, amount: 9000, note: 'Workshop format, priced below the full security courses.' } });
      await prisma.courseReview.create({ data: { courseId: course.id, actorId: creatorId, decision: 'SUBMITTED' } });
    }
    if (spec.status === 'PUBLISHED') {
      await prisma.courseReview.createMany({
        data: [
          { courseId: course.id, actorId: creatorId, decision: 'SUBMITTED' },
          { courseId: course.id, actorId: admin, decision: 'APPROVED', feedback: 'Clear structure and well-scoped checks.' },
          { courseId: course.id, actorId: admin, decision: 'PUBLISHED' },
        ],
      });
    }

    const moduleQuizIds: (string | null)[] = [];
    for (const [mi, m] of spec.modules.entries()) {
      const module = await prisma.courseModule.create({
        data: { courseId: course.id, title: m.title, summary: m.summary, position: mi + 1, access: m.access, prerequisiteQuizId: m.gatedBy !== undefined ? moduleQuizIds[m.gatedBy] : null },
      });
      for (const [li, l] of m.lessons.entries()) {
        await prisma.lesson.create({
          data: { moduleId: module.id, title: l.title, position: li + 1, estimatedMinutes: l.minutes, content: l.content as unknown as Prisma.InputJsonValue },
        });
      }
      if (m.quiz) {
        const quiz = await prisma.quiz.create({
          data: { courseId: course.id, moduleId: module.id, title: m.quiz.title, passingScore: m.quiz.passingScore, maxAttempts: m.quiz.maxAttempts, isPublished: true, feedbackPolicy: 'FULL_EXPLANATIONS' },
        });
        for (const [qi, q] of m.quiz.questions.entries()) {
          await prisma.question.create({
            data: {
              quizId: quiz.id,
              prompt: q.prompt,
              explanation: q.explanation,
              position: qi + 1,
              options: { create: q.options.map(([label, isCorrect], oi) => ({ label, isCorrect, position: oi + 1 })) },
            },
          });
        }
        moduleQuizIds.push(quiz.id);
      } else {
        moduleQuizIds.push(null);
      }
    }
  }

  console.log('Seeding mentor assignments…');
  const kemi = users.get('kemi.adeyemi@academy.local')!;
  for (const slug of ['production-ready-apis-with-nodejs', 'foundations-of-software-engineering']) {
    await prisma.mentorAssignment.upsert({
      where: { mentorId_courseId: { mentorId: kemi, courseId: courseIds.get(slug)! } },
      create: { mentorId: kemi, courseId: courseIds.get(slug)!, assignedById: admin },
      update: {},
    });
  }

  console.log('Seeding learner progress, purchases and certificates…');
  const chidi = users.get('chidi.eze@academy.local')!;
  const amaka = users.get('amaka.obi@academy.local')!;
  const femi = users.get('femi.ajayi@academy.local')!;
  const foundations = courseIds.get('foundations-of-software-engineering')!;
  const apis = courseIds.get('production-ready-apis-with-nodejs')!;
  const cloud = courseIds.get('cloud-infrastructure-essentials')!;

  // Chidi: completed Foundations (certificate), bought and is midway through APIs.
  await completeCourse(chidi, foundations);
  await purchase(chidi, apis, 'SA-SEED-CHIDI-APIS', 'SUCCESSFUL');
  await completeLessons(chidi, apis, 3, true);
  // Amaka: in progress on Foundations, one failed and one abandoned payment.
  await completeLessons(amaka, foundations, 2, false);
  await purchase(amaka, cloud, 'SA-SEED-AMAKA-CLOUD-1', 'FAILED');
  await purchase(amaka, cloud, 'SA-SEED-AMAKA-CLOUD-2', 'CANCELLED');
  // Femi: just enrolled in the free ML course.
  await prisma.courseEnrollment.upsert({ where: { userId_courseId: { userId: femi, courseId: courseIds.get('machine-learning-explained-plainly')! } }, create: { userId: femi, courseId: courseIds.get('machine-learning-explained-plainly')! }, update: {} });

  console.log('Seeding support conversations…');
  if (!(await prisma.supportThread.findFirst({ where: { learnerId: chidi, courseId: apis } }))) {
    const lesson = await prisma.lesson.findFirst({ where: { module: { courseId: apis, position: 2 } }, orderBy: { position: 'asc' } });
    const t0 = Date.now() - 2 * 86_400_000;
    await prisma.supportThread.create({
      data: {
        learnerId: chidi,
        courseId: apis,
        lessonId: lesson?.id,
        mentorId: kemi,
        subject: 'Should validation live in DTOs or the service?',
        status: 'ANSWERED',
        lastMessageAt: new Date(t0 + 3_600_000),
        messages: {
          create: [
            { authorId: chidi, body: 'In the validation lesson you check shape in the DTO but rules in the service. Why not do everything in one place?', createdAt: new Date(t0) },
            { authorId: kemi, body: 'Good question. The DTO can only see the request. Rules like "you cannot buy a course you already own" need the database, so they belong in the service. Keeping shape checks at the edge means the service never sees malformed input.', createdAt: new Date(t0 + 3_600_000) },
          ],
        },
        reads: { create: [{ userId: kemi, lastReadAt: new Date(t0 + 3_600_000) }] },
      },
    });
    await prisma.supportThread.create({
      data: {
        learnerId: amaka,
        courseId: foundations,
        subject: 'Is a test that checks a private helper always bad?',
        status: 'WAITING_FOR_RESPONSE',
        mentorId: kemi,
        lastMessageAt: new Date(Date.now() - 3 * 86_400_000),
        messages: { create: [{ authorId: amaka, body: 'Sometimes the private helper has tricky logic. Is it still wrong to test it directly?', createdAt: new Date(Date.now() - 3 * 86_400_000) }] },
        reads: { create: [{ userId: amaka }] },
      },
    });
  }

  console.log('Seeding roadmaps…');
  await roadmap(
    'backend-engineer-path',
    'Backend Engineer Path',
    'From first principles to running APIs in the cloud. Each step builds on the one before it.',
    users.get('ada.okafor@academy.local')!,
    [
      { key: 'found', type: 'COURSE', title: 'Foundations of Software Engineering', course: 'foundations-of-software-engineering' },
      { key: 'git', type: 'TOPIC', title: 'Version-control habits', description: 'Practise small commits and pull requests on a personal project for a week.' },
      { key: 'apis', type: 'COURSE', title: 'Production-Ready APIs', course: 'production-ready-apis-with-nodejs' },
      { key: 'portfolio', type: 'MILESTONE', title: 'Ship a portfolio API', description: 'Deploy a small API with validation, auth and health checks, and write a README for it.' },
      { key: 'cloud', type: 'COURSE', title: 'Cloud Infrastructure Essentials', course: 'cloud-infrastructure-essentials' },
      { key: 'comms', type: 'COURSE', title: 'Consulting Communication', course: 'consulting-communication-for-engineers', optional: true },
    ],
    [['found', 'git'], ['found', 'apis'], ['git', 'portfolio'], ['apis', 'portfolio'], ['apis', 'cloud'], ['portfolio', 'comms']],
    'PUBLISHED',
  );
  await roadmap(
    'security-minded-engineer',
    'Security-Minded Engineer',
    'Defend the systems you build: networks, services and the habit of thinking like an attacker.',
    users.get('tunde.bello@academy.local')!,
    [
      { key: 'found', type: 'COURSE', title: 'Foundations of Software Engineering', course: 'foundations-of-software-engineering' },
      { key: 'net', type: 'COURSE', title: 'Practical Network Defence', course: 'practical-network-defence' },
      { key: 'ml', type: 'COURSE', title: 'Machine Learning, Explained Plainly', course: 'machine-learning-explained-plainly', optional: true },
      { key: 'drill', type: 'ACTIVITY', title: 'Run a tabletop incident drill', description: 'With two colleagues, walk through a compromised-credentials scenario end to end.' },
    ],
    [['found', 'net'], ['net', 'drill'], ['found', 'ml']],
    'PUBLISHED',
  );

  console.log('Seeding notifications and audit history…');
  if (!(await prisma.auditLog.findFirst({ where: { action: 'seed.run' } }))) {
    await prisma.auditLog.create({ data: { actorId: admin, action: 'seed.run', resourceType: 'Platform', metadata: { note: 'Development seed' } } });
    await prisma.notification.createMany({
      data: [
        { userId: chidi, type: 'support.message', title: 'Kemi Adeyemi answered your question', body: 'Should validation live in DTOs or the service?', link: '/support' },
        { userId: admin, type: 'course.submitted', title: 'Course submitted for review: Threat Modelling Workshop', link: `/admin/courses/${courseIds.get('threat-modelling-workshop')}` },
      ],
    });
  }

  console.log(`\nSeed complete. Every account uses the password: ${SEED_PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.roles.filter((r) => r !== 'LEARNER').join('+') || 'LEARNER'}`.padEnd(18), u.email);
}

async function publishedStructure(courseId: string) {
  return prisma.courseModule.findMany({
    where: { courseId, isPublished: true },
    orderBy: { position: 'asc' },
    include: { lessons: { where: { isPublished: true }, orderBy: { position: 'asc' } }, quizzes: { where: { isPublished: true }, include: { questions: { include: { options: true } } } } },
  });
}

async function passQuiz(userId: string, quiz: { id: string; questions: { id: string; options: { id: string; isCorrect: boolean }[] }[] }) {
  if (await prisma.quizPass.findUnique({ where: { userId_quizId: { userId, quizId: quiz.id } } })) return;
  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId,
      attemptNumber: 1,
      status: 'SUBMITTED',
      questionOrder: quiz.questions.map((q) => q.id),
      scorePercent: 100,
      pointsEarned: quiz.questions.length,
      pointsTotal: quiz.questions.length,
      passed: true,
      submittedAt: new Date(),
      answers: { create: quiz.questions.map((q) => ({ questionId: q.id, selectedOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id), isCorrect: true, pointsAwarded: 1 })) },
    },
  });
  await prisma.quizPass.create({ data: { userId, quizId: quiz.id, attemptId: attempt.id } });
}

async function completeLessons(userId: string, courseId: string, count: number, passQuizzes: boolean) {
  const modules = await publishedStructure(courseId);
  const lessons = modules.flatMap((m) => m.lessons);
  await prisma.courseEnrollment.upsert({ where: { userId_courseId: { userId, courseId } }, create: { userId, courseId, lastLessonId: lessons[Math.min(count, lessons.length - 1)]?.id }, update: {} });
  for (const l of lessons.slice(0, count)) {
    await prisma.lessonProgress.upsert({ where: { userId_lessonId: { userId, lessonId: l.id } }, create: { userId, lessonId: l.id, completedAt: new Date() }, update: {} });
  }
  if (passQuizzes) {
    const done = new Set(lessons.slice(0, count).map((l) => l.id));
    for (const m of modules) if (m.lessons.every((l) => done.has(l.id))) for (const q of m.quizzes) await passQuiz(userId, q);
  }
}

async function completeCourse(userId: string, courseId: string) {
  const modules = await publishedStructure(courseId);
  const lessons = modules.flatMap((m) => m.lessons);
  await completeLessons(userId, courseId, lessons.length, true);
  await prisma.courseEnrollment.update({ where: { userId_courseId: { userId, courseId } }, data: { completedAt: new Date(), lastLessonId: lessons[lessons.length - 1].id } });
  if (!(await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } }))) {
    const [user, course] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { creator: true } }),
    ]);
    await prisma.certificate.create({
      data: {
        userId,
        courseId,
        serial: 'SA-2026-SEED01',
        verificationCode: 'SEEDVERIFY01',
        learnerName: user.fullName,
        courseTitle: course.title,
        issuerName: `${course.creator.fullName} · Schutech Academy`,
      },
    });
  }
}

async function purchase(userId: string, courseId: string, reference: string, status: 'SUCCESSFUL' | 'FAILED' | 'CANCELLED') {
  if (await prisma.paymentTransaction.findUnique({ where: { reference } })) return;
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  const amount = course.approvedPrice ?? new Prisma.Decimal(0);
  const trx = await prisma.paymentTransaction.create({
    data: {
      reference,
      userId,
      courseId,
      provider: 'sandbox',
      amount,
      currency: course.currency,
      status,
      channel: 'sandbox',
      verifiedAt: new Date(),
      paidAt: status === 'SUCCESSFUL' ? new Date() : null,
      failureReason: status === 'FAILED' ? 'Declined by issuer (seed)' : status === 'CANCELLED' ? 'Checkout abandoned' : null,
    },
  });
  if (status === 'SUCCESSFUL') {
    await prisma.courseEntitlement.upsert({ where: { userId_courseId: { userId, courseId } }, create: { userId, courseId, transactionId: trx.id }, update: {} });
    await prisma.courseEnrollment.upsert({ where: { userId_courseId: { userId, courseId } }, create: { userId, courseId }, update: {} });
    await prisma.financialLedgerEntry.create({ data: { transactionId: trx.id, courseId, creatorId: course.creatorId, type: 'SALE', amount, currency: course.currency, memo: `Sale ${reference}` } });
  }
}

async function roadmap(
  slug: string,
  title: string,
  summary: string,
  ownerId: string,
  nodes: { key: string; type: 'COURSE' | 'TOPIC' | 'ACTIVITY' | 'MILESTONE'; title: string; description?: string; course?: string; optional?: boolean }[],
  edges: [string, string][],
  status: 'PUBLISHED' | 'DRAFT',
) {
  if (await prisma.roadmap.findUnique({ where: { slug } })) return;
  const r = await prisma.roadmap.create({ data: { slug, title, summary, ownerId, status, publishedAt: status === 'PUBLISHED' ? new Date() : null } });
  const ids = new Map<string, string>();
  for (const [i, n] of nodes.entries()) {
    const course = n.course ? await prisma.course.findUnique({ where: { slug: n.course } }) : null;
    const node = await prisma.roadmapNode.create({
      data: { roadmapId: r.id, type: n.type, title: n.title, description: n.description, courseId: course?.id, position: i + 1, isOptional: n.optional ?? false },
    });
    ids.set(n.key, node.id);
  }
  await prisma.roadmapEdge.createMany({ data: edges.map(([a, b]) => ({ roadmapId: r.id, fromNodeId: ids.get(a)!, toNodeId: ids.get(b)! })) });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
