import { INestApplication } from '@nestjs/common';
import { Client, createApp, loggedIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Course authoring, approval and pricing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ada: Client;
  let tunde: Client;
  let admin: Client;
  let learner: Client;
  let subjectId: string;
  let courseId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    [ada, tunde, admin, learner] = await Promise.all([
      loggedIn(app, 'ada.okafor@academy.local'),
      loggedIn(app, 'tunde.bello@academy.local'),
      loggedIn(app, 'admin@academy.local'),
      loggedIn(app, 'chidi.eze@academy.local'),
    ]);
    subjectId = (await prisma.subject.findUniqueOrThrow({ where: { slug: 'software-engineering' } })).id;
  });
  afterAll(() => app.close());

  it('only lets creators create courses', async () => {
    const body = { title: 'Learner course', shortDescription: 'Should not be allowed at all', subjectId };
    expect((await learner.post('/creator/courses', body)).status).toBe(403);
    const res = await ada.post('/creator/courses', { title: 'Testing in Practice', shortDescription: 'Write tests that catch real regressions.', subjectId, proposedPrice: 8000 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.approvedPrice).toBeNull(); // a proposal is not a price
    courseId = res.body.id;
  });

  it('prevents creators from editing other creators’ courses', async () => {
    expect((await tunde.patch(`/creator/courses/${courseId}`, { title: 'Hijacked title' })).status).toBe(403);
    expect((await tunde.post(`/courses/${courseId}/modules`, { title: 'Injected' })).status).toBe(403);
  });

  it('refuses submission until the course is ready', async () => {
    const res = await ada.post(`/courses/${courseId}/transitions`, { action: 'submit' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COURSE_NOT_READY');
  });

  it('builds curriculum with validated structured content', async () => {
    const m1 = await ada.post(`/courses/${courseId}/modules`, { title: 'Why tests fail', access: 'FREE' });
    const m2 = await ada.post(`/courses/${courseId}/modules`, { title: 'Testing at scale', access: 'PREMIUM' });
    expect([m1.status, m2.status]).toEqual([201, 201]);
    const bad = await ada.post(`/modules/${m1.body.id}/lessons`, { title: 'XSS', content: [{ type: 'html', html: '<script>alert(1)</script>' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_CONTENT');
    const lesson = await ada.post(`/modules/${m1.body.id}/lessons`, { title: 'Flaky tests', content: [{ type: 'paragraph', text: 'A flaky test **erodes** trust.', onclick: 'x' }] });
    expect(lesson.status).toBe(201);
    expect(lesson.body.content).toEqual([{ type: 'paragraph', text: 'A flaky test **erodes** trust.' }]);
    await ada.post(`/modules/${m2.body.id}/lessons`, { title: 'Parallel suites', content: [{ type: 'paragraph', text: 'Shard by duration.' }] });
    const upd = await ada.patch(`/creator/courses/${courseId}`, {
      description: 'A practical course on writing automated tests that protect behaviour and survive refactoring.',
      learningOutcomes: ['Write behaviour-focused tests', 'Remove flakiness'],
    });
    expect(upd.status).toBe(200);
  });

  it('gives every course its own roadmap, required before submission', async () => {
    const { id: roadmapId } = (await ada.get(`/creator/courses/${courseId}/roadmap`)).body;
    expect(roadmapId).toBeDefined();
    const notReady = await ada.post(`/courses/${courseId}/transitions`, { action: 'submit' });
    expect(notReady.body.details).toContain('Build the course roadmap (add at least one step).');

    // Only the course creator (or an administrator) edits it.
    expect((await tunde.post(`/creator/roadmaps/${roadmapId}/nodes`, { type: 'TOPIC', title: 'Injected step' })).status).toBe(403);
    // Module steps must reference this course's own modules.
    const foreign = await prisma.courseModule.findFirstOrThrow({ where: { course: { slug: 'foundations-of-software-engineering' } } });
    expect((await ada.post(`/creator/roadmaps/${roadmapId}/nodes`, { type: 'MODULE', title: 'Foreign', moduleId: foreign.id })).body.code).toBe('INVALID_MODULE');

    const modules = await prisma.courseModule.findMany({ where: { courseId }, orderBy: { position: 'asc' } });
    const m1 = await ada.post(`/creator/roadmaps/${roadmapId}/nodes`, { type: 'MODULE', title: modules[0].title, moduleId: modules[0].id });
    const m2 = await ada.post(`/creator/roadmaps/${roadmapId}/nodes`, { type: 'MODULE', title: modules[1].title, moduleId: modules[1].id });
    expect([m1.status, m2.status]).toEqual([201, 201]);
    expect((await ada.post(`/creator/roadmaps/${roadmapId}/edges`, { fromNodeId: m1.body.id, toNodeId: m2.body.id })).status).toBe(201);
    // Course roadmaps are not reviewed separately, and cannot be deleted.
    expect((await ada.post(`/roadmaps/${roadmapId}/decisions`, { action: 'submit' })).body.code).toBe('COURSE_ROADMAP');
    expect((await ada.delete(`/creator/roadmaps/${roadmapId}`)).body.code).toBe('COURSE_ROADMAP');
    // Not visible to the public while the course is a draft.
    expect((await new Client(app).get(`/courses/${courseId}/roadmap`)).status).toBe(404);
  });

  it('submits, locks content during review and lets an administrator decide', async () => {
    expect((await ada.post(`/courses/${courseId}/transitions`, { action: 'submit' })).body.status).toBe('SUBMITTED');
    expect((await ada.patch(`/creator/courses/${courseId}`, { title: 'Changed in review' })).body.code).toBe('COURSE_LOCKED');
    // Creators cannot approve their own work.
    expect((await ada.post(`/courses/${courseId}/transitions`, { action: 'approve' })).status).toBe(403);
    // Rejection needs feedback.
    expect((await admin.post(`/courses/${courseId}/transitions`, { action: 'reject' })).body.code).toBe('FEEDBACK_REQUIRED');
    const approved = await admin.post(`/courses/${courseId}/transitions`, { action: 'approve', feedback: 'Looks good' });
    expect(approved.body.status).toBe('APPROVED');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'course.approve', resourceId: courseId } });
    expect(audit).toMatchObject({ outcome: 'SUCCESS' });
    const notification = await prisma.notification.findFirst({ where: { type: 'course.approved', link: `/creator/courses/${courseId}` } });
    expect(notification).not.toBeNull();
  });

  it('will not publish premium modules without an approved price', async () => {
    const res = await ada.post(`/courses/${courseId}/transitions`, { action: 'publish' });
    expect(res.body.code).toBe('PRICE_NOT_APPROVED');
  });

  it('requires an administrator to approve the proposed price, with history', async () => {
    const proposal = await prisma.coursePriceProposal.findFirstOrThrow({ where: { courseId, status: 'PENDING' } });
    expect((await ada.post(`/admin/price-proposals/${proposal.id}/decision`, { decision: 'APPROVED' })).status).toBe(403);
    expect((await admin.post(`/admin/price-proposals/${proposal.id}/decision`, { decision: 'APPROVED', note: 'Fair' })).status).toBe(201);
    expect((await admin.post(`/admin/price-proposals/${proposal.id}/decision`, { decision: 'APPROVED' })).body.code).toBe('ALREADY_DECIDED');
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    expect(Number(course.approvedPrice)).toBe(8000);
  });

  it('publishes and becomes discoverable; drafts never are', async () => {
    expect((await ada.post(`/courses/${courseId}/transitions`, { action: 'publish' })).body.status).toBe('PUBLISHED');
    const catalog = await new Client(app).get('/courses?search=Testing%20in%20Practice');
    expect(catalog.body.items.map((c: { id: string }) => c.id)).toContain(courseId);
    // The course roadmap goes live with the course, for everyone.
    const roadmap = await new Client(app).get(`/courses/${courseId}/roadmap`);
    expect(roadmap.status).toBe(200);
    expect(roadmap.body.nodes.map((n: { type: string }) => n.type)).toEqual(['MODULE', 'MODULE']);
    expect((await new Client(app).get(`/courses/${courseId}`)).body.courseRoadmap).toMatchObject({ steps: 2 });
    const draft = await new Client(app).get('/courses/kubernetes-operations');
    expect(draft.status).toBe(404);
    const all = await new Client(app).get('/courses?pageSize=100');
    expect(all.body.items.every((c: { slug: string }) => c.slug !== 'kubernetes-operations')).toBe(true);
  });

  it('rejects invalid status transitions', async () => {
    const res = await admin.post(`/courses/${courseId}/transitions`, { action: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });
});
