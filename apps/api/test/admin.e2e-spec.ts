import { INestApplication } from '@nestjs/common';
import { Client, createApp, loggedIn, registerVerified } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Administration, roles, roadmaps and support', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Client;
  let adminId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    admin = await loggedIn(app, 'admin@academy.local');
    adminId = (await admin.get('/auth/me')).body.id;
  });
  afterAll(() => app.close());

  it('lets administrators assign roles, audited, but never to themselves', async () => {
    const { client, id } = await registerVerified(app);
    expect((await client.patch(`/admin/users/${id}/roles`, { roles: ['ADMIN'] })).status).toBe(403);
    expect((await admin.patch(`/admin/users/${adminId}/roles`, { roles: ['LEARNER'] })).body.code).toBe('SELF_ROLE_CHANGE');
    const res = await admin.patch(`/admin/users/${id}/roles`, { roles: ['MENTOR'], reason: 'Experienced tutor' });
    expect(res.status).toBe(200);
    expect((await client.get('/auth/me')).body.permissions).toContain('support.respond');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'user.roles.update', resourceId: id } });
    expect(audit?.metadata).toMatchObject({ added: ['MENTOR'], reason: 'Experienced tutor' });
  });

  it('suspends accounts and ends their sessions', async () => {
    const { client, id, email } = await registerVerified(app);
    expect((await admin.patch(`/admin/users/${id}/status`, { status: 'SUSPENDED', reason: 'Abuse' })).status).toBe(200);
    expect((await client.get('/auth/me')).status).toBe(401);
    expect((await new Client(app).post('/auth/login', { email, password: 'Academy2026!dev' })).body.code).toBe('ACCOUNT_NOT_AUTHORIZED');
    expect(await prisma.auditLog.count({ where: { action: 'user.suspend', resourceId: id } })).toBe(1);
  });

  it('turns an approved creator application into creator permissions', async () => {
    const { client } = await registerVerified(app, 'Aspiring Creator');
    expect((await client.post('/creator/courses', { title: 'Nope', shortDescription: 'Not yet a creator', subjectId: (await prisma.subject.findFirstOrThrow()).id })).status).toBe(403);
    const appRes = await client.post('/creator-applications', { headline: 'Teaching SQL to finance teams', expertise: 'Ten years of analytics work', motivation: 'I want to help analysts move from spreadsheets to reproducible queries.' });
    expect(appRes.status).toBe(201);
    expect((await client.post('/creator-applications', { headline: 'Again please', expertise: 'Ten years of analytics', motivation: 'Duplicate application should be rejected by the API.' })).body.code).toBe('APPLICATION_PENDING');
    expect((await admin.post(`/admin/creator-applications/${appRes.body.id}/review`, { decision: 'APPROVED' })).status).toBe(201);
    expect((await client.get('/auth/me')).body.roles).toContain('CREATOR');
  });

  it('validates settings and audits changes', async () => {
    expect((await admin.patch('/admin/settings', { values: { 'payments.secretKey': 'x' } })).body.code).toBe('INVALID_SETTING');
    const ok = await admin.patch('/admin/settings', { values: { 'finance.creatorSharePercent': 70 } });
    expect(ok.body.updated).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'settings.update' } })).toBeGreaterThan(0);
    await admin.patch('/admin/settings', { values: { 'finance.creatorSharePercent': null } });
  });

  it('exposes no way to modify the audit log', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow();
    expect((await admin.delete(`/admin/audit-logs/${entry.id}`)).status).toBe(404);
    expect((await admin.patch(`/admin/audit-logs/${entry.id}`, { action: 'x' })).status).toBe(404);
  });

  it('derives overview figures from the database', async () => {
    const res = await admin.get('/admin/overview');
    expect(res.body.totals.publishedCourses).toBe(await prisma.course.count({ where: { status: 'PUBLISHED' } }));
    expect(res.body.pending.courses).toBe(await prisma.course.count({ where: { status: 'SUBMITTED' } }));
    expect((await (await loggedIn(app, 'ada.okafor@academy.local')).get('/admin/overview')).status).toBe(403);
  });

  it('rejects circular roadmap prerequisites and validates before publishing', async () => {
    const ada = await loggedIn(app, 'ada.okafor@academy.local');
    const r = await ada.post('/creator/roadmaps', { title: 'Cycle test map', summary: 'Checks that loops are rejected.' });
    const a = await ada.post(`/creator/roadmaps/${r.body.id}/nodes`, { type: 'TOPIC', title: 'Topic A' });
    const b = await ada.post(`/creator/roadmaps/${r.body.id}/nodes`, { type: 'TOPIC', title: 'Topic B' });
    expect((await ada.post(`/creator/roadmaps/${r.body.id}/edges`, { fromNodeId: a.body.id, toNodeId: b.body.id })).status).toBe(201);
    const loop = await ada.post(`/creator/roadmaps/${r.body.id}/edges`, { fromNodeId: b.body.id, toNodeId: a.body.id });
    expect(loop.body.code).toBe('CYCLE');
    expect((await ada.post(`/creator/roadmaps/${r.body.id}/nodes`, { type: 'COURSE', title: 'No course' })).body.code).toBe('COURSE_MISSING');
    expect((await ada.post(`/roadmaps/${r.body.id}/decisions`, { action: 'publish' })).status).toBe(403);
    expect((await ada.post(`/roadmaps/${r.body.id}/decisions`, { action: 'submit' })).body.status).toBe('SUBMITTED');
    expect((await admin.post(`/roadmaps/${r.body.id}/decisions`, { action: 'publish' })).body.status).toBe('PUBLISHED');
  });

  it('computes roadmap node availability from real progress', async () => {
    const chidi = await loggedIn(app, 'chidi.eze@academy.local');
    const view = await chidi.get('/roadmaps/backend-engineer-path');
    const by = (title: string) => view.body.nodes.find((n: { title: string }) => n.title === title);
    expect(by('Foundations of Software Engineering')).toMatchObject({ state: 'COMPLETED', action: 'VIEW_COURSE' });
    expect(by('Production-Ready APIs')).toMatchObject({ state: 'IN_PROGRESS', action: 'RESUME_LEARNING' });
    expect(by('Cloud Infrastructure Essentials')).toMatchObject({ state: 'LOCKED_PREREQUISITE' });
    const anon = await new Client(app).get('/roadmaps/backend-engineer-path');
    expect(anon.body.nodes.find((n: { title: string }) => n.title === 'Foundations of Software Engineering').state).toBe('AVAILABLE');
  });

  it('derives module steps on a course roadmap from real progress and access', async () => {
    const chidi = await loggedIn(app, 'chidi.eze@academy.local');
    const view = await chidi.get('/courses/production-ready-apis-with-nodejs/roadmap');
    expect(view.status).toBe(200);
    const modules = view.body.nodes.filter((n: { type: string }) => n.type === 'MODULE');
    // Chidi finished module 1, is midway through module 2, and has not passed the gate to module 3.
    expect(modules.map((m: { state: string }) => m.state)).toEqual(['COMPLETED', 'IN_PROGRESS', 'LOCKED_PREREQUISITE']);
    // A visitor who has not paid sees the premium modules as locked, but can see the whole map.
    const anon = await new Client(app).get('/courses/production-ready-apis-with-nodejs/roadmap');
    const anonModules = anon.body.nodes.filter((n: { type: string }) => n.type === 'MODULE');
    expect(anonModules[0].state).toBe('AVAILABLE');
    expect(anonModules[1].state).toMatch(/LOCKED/);
    expect((await chidi.post(`/roadmap-nodes/${modules[0].id}/complete`)).body.code).toBe('LEARNABLE_NODE');
  });

  it('keeps support conversations private and updates status on reply', async () => {
    const apis = await prisma.course.findUniqueOrThrow({ where: { slug: 'production-ready-apis-with-nodejs' } });
    const learner = await registerVerified(app);
    expect((await learner.client.post('/support-threads', { courseId: apis.id, subject: 'Not enrolled yet', body: 'Hello?' })).body.code).toBe('NOT_ENROLLED');
    await learner.client.post('/enrollments', { courseId: apis.id });
    const t = await learner.client.post('/support-threads', { courseId: apis.id, subject: 'How do I shard tests?', body: 'Details inside.' });
    expect(t.status).toBe(201);
    expect(t.body.mentorId).not.toBeNull(); // auto-assigned to the course mentor

    const stranger = await registerVerified(app);
    expect((await stranger.client.get(`/support-threads/${t.body.id}`)).status).toBe(404);

    const mentor = await loggedIn(app, 'kemi.adeyemi@academy.local');
    expect((await mentor.post(`/support-threads/${t.body.id}/messages`, { body: 'Split by duration.' })).status).toBe(201);
    expect((await learner.client.get(`/support-threads/${t.body.id}`)).body.status).toBe('ANSWERED');
    const msgs = await learner.client.get(`/support-threads/${t.body.id}/messages?limit=1`);
    expect(msgs.body).toMatchObject({ hasMore: true });
    expect(msgs.body.items).toHaveLength(1);
    expect((await learner.client.get('/notifications/unread-count')).body.unread).toBeGreaterThan(0);
  });
});
