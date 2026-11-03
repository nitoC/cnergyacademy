import { INestApplication } from '@nestjs/common';
import { createApp, loggedIn, registerVerified } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Learning engine: access, quizzes, progress and certificates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;
  let modules: { id: string; position: number; lessons: { id: string }[]; quizzes: { id: string; questions: { id: string; options: { id: string; isCorrect: boolean }[] }[] }[] }[];

  const answers = (quiz: (typeof modules)[number]['quizzes'][number], correct: boolean) =>
    quiz.questions.map((q) => ({ questionId: q.id, optionIds: [q.options.find((o) => o.isCorrect === correct)!.id] }));

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const course = await prisma.course.findUniqueOrThrow({
      where: { slug: 'foundations-of-software-engineering' },
      include: { modules: { orderBy: { position: 'asc' }, include: { lessons: { orderBy: { position: 'asc' } }, quizzes: { include: { questions: { include: { options: true } } } } } } },
    });
    courseId = course.id;
    modules = course.modules;
  });
  afterAll(() => app.close());

  it('takes a new learner from enrolment through a gated module to a certificate', async () => {
    const { client, id: userId } = await registerVerified(app, 'Journey Learner');
    expect((await client.post('/enrollments', { courseId })).status).toBe(201);

    // Module 3 is gated by module 2's quiz.
    const gated = await client.get(`/learn/lessons/${modules[2].lessons[0].id}`);
    expect(gated.status).toBe(403);
    expect(gated.body.code).toBe('PREREQUISITE_NOT_COMPLETED');
    expect(gated.body.details.prerequisiteQuizId).toBe(modules[1].quizzes[0].id);

    // Read and complete a lesson.
    const read = await client.get(`/learn/lessons/${modules[0].lessons[0].id}`);
    expect(read.status).toBe(200);
    expect(read.body.lesson.content.length).toBeGreaterThan(0);
    const done = await client.post(`/learn/lessons/${modules[0].lessons[0].id}/complete`);
    expect(done.body.progress.lessonsCompleted).toBe(1);

    // Attempt payload never contains the answer key.
    const quiz = modules[1].quizzes[0];
    const attempt = await client.post(`/quizzes/${quiz.id}/attempts`);
    expect(attempt.status).toBe(201);
    expect(JSON.stringify(attempt.body)).not.toMatch(/isCorrect|explanation/);

    // Client-supplied scores are rejected outright.
    const forged = await client.post(`/attempts/${attempt.body.id}/submit`, { answers: [], scorePercent: 100, passed: true });
    expect(forged.status).toBe(400);

    const failed = await client.post(`/attempts/${attempt.body.id}/submit`, { answers: answers(quiz, false) });
    expect(failed.body).toMatchObject({ scorePercent: 0, passed: false });
    expect((await client.post(`/attempts/${attempt.body.id}/submit`, { answers: answers(quiz, true) })).body.code).toBe('ATTEMPT_CLOSED');

    const second = await client.post(`/quizzes/${quiz.id}/attempts`);
    const passed = await client.post(`/attempts/${second.body.id}/submit`, { answers: answers(quiz, true) });
    expect(passed.body).toMatchObject({ scorePercent: 100, passed: true });
    expect(passed.body.unlockedModules.map((m: { id: string }) => m.id)).toContain(modules[2].id);
    expect((await client.get(`/learn/lessons/${modules[2].lessons[0].id}`)).status).toBe(200);

    // Finish everything else.
    for (const m of modules) {
      for (const l of m.lessons) expect((await client.post(`/learn/lessons/${l.id}/complete`)).status).toBe(200);
    }
    for (const m of modules) {
      for (const q of m.quizzes) {
        if (q.id === quiz.id) continue;
        const a = await client.post(`/quizzes/${q.id}/attempts`);
        const r = await client.post(`/attempts/${a.body.id}/submit`, { answers: answers(q, true) });
        expect(r.body.passed).toBe(true);
      }
    }
    const journey = await client.get(`/learn/courses/${courseId}/journey`);
    expect(journey.body.progress).toMatchObject({ percent: 100, isComplete: true });
    expect(journey.body.modules.every((m: { state: string }) => m.state === 'COMPLETED')).toBe(true);

    // Exactly one certificate, publicly verifiable, downloadable by its owner only.
    const certs = await prisma.certificate.findMany({ where: { userId, courseId } });
    expect(certs).toHaveLength(1);
    expect((await client.post(`/learn/lessons/${modules[0].lessons[0].id}/complete`)).status).toBe(200);
    expect(await prisma.certificate.count({ where: { userId, courseId } })).toBe(1);
    const verify = await (await loggedIn(app, 'femi.ajayi@academy.local')).get(`/certificates/verify/${certs[0].verificationCode}`);
    expect(verify.body).toMatchObject({ valid: true, learnerName: 'Journey Learner' });
    expect(verify.body).not.toHaveProperty('email');
    const pdf = await client.get(`/certificates/${certs[0].id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const other = await loggedIn(app, 'amaka.obi@academy.local');
    expect((await other.get(`/certificates/${certs[0].id}/pdf`)).status).toBe(403);
  });

  it('enforces attempt limits on the server', async () => {
    const { client } = await registerVerified(app);
    const quiz = modules[1].quizzes[0]; // maxAttempts: 3
    for (let i = 0; i < 3; i++) {
      const a = await client.post(`/quizzes/${quiz.id}/attempts`);
      expect(a.status).toBe(201);
      await client.post(`/attempts/${a.body.id}/submit`, { answers: answers(quiz, false) });
    }
    const blocked = await client.post(`/quizzes/${quiz.id}/attempts`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('NO_ATTEMPTS_REMAINING');
  });

  it('prevents learners from reading another learner’s attempt', async () => {
    const a = await registerVerified(app);
    const b = await registerVerified(app);
    const attempt = await a.client.post(`/quizzes/${modules[0].quizzes[0].id}/attempts`);
    expect((await b.client.get(`/attempts/${attempt.body.id}`)).status).toBe(404);
  });

  it('keeps the dashboard, journey and course page progress consistent', async () => {
    const chidi = await loggedIn(app, 'chidi.eze@academy.local');
    const apis = await prisma.course.findUniqueOrThrow({ where: { slug: 'production-ready-apis-with-nodejs' } });
    const [dash, journey, detail] = await Promise.all([chidi.get('/learn/dashboard'), chidi.get(`/learn/courses/${apis.id}/journey`), chidi.get(`/courses/${apis.slug}`)]);
    const fromDash = [dash.body.continueLearning, ...dash.body.inProgress, ...dash.body.completed].find((x: { course: { id: string } }) => x.course.id === apis.id);
    expect(fromDash.progress.percent).toBe(journey.body.progress.percent);
    expect(detail.body.viewer.progress.percent).toBe(journey.body.progress.percent);
  });
});
