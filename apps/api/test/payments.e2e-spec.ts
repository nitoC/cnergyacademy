import { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { Client, P, PASSWORD, createApp, loggedIn, registerVerified, uniqueEmail } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payments, entitlements and the ledger', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let course: { id: string; approvedPrice: unknown };
  let premiumLesson: string;
  let gatedLesson: string;
  let admin: Client;

  const sign = (body: string) => createHmac('sha512', process.env.JWT_ACCESS_SECRET!).update(body).digest('hex');
  const webhook = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload);
    return request(app.getHttpServer()).post(`${P}/payments/webhook`).set('content-type', 'application/json').set('x-sandbox-signature', signature ?? sign(raw)).send(raw);
  };

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const c = await prisma.course.findUniqueOrThrow({
      where: { slug: 'production-ready-apis-with-nodejs' },
      include: { modules: { orderBy: { position: 'asc' }, include: { lessons: { orderBy: { position: 'asc' } } } } },
    });
    course = c;
    premiumLesson = c.modules[1].lessons[0].id; // PREMIUM
    gatedLesson = c.modules[2].lessons[0].id; // PREMIUM_AND_PREREQUISITE_QUIZ
    admin = await loggedIn(app, 'admin@academy.local');
  });
  afterAll(() => app.close());

  it('requires a verified email before checkout', async () => {
    const c = new Client(app);
    await c.post('/auth/register', { email: uniqueEmail(), password: PASSWORD, fullName: 'Unverified' });
    const res = await c.post('/payments/initialize', { courseId: course.id });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('grants access only after server-side verification, exactly once', async () => {
    const { client, id: userId } = await registerVerified(app, 'Paying Learner');
    expect((await client.get(`/learn/lessons/${premiumLesson}`)).body.code).toBe('PURCHASE_REQUIRED');

    // The price comes from the database; anything the client sends is rejected.
    expect((await client.post('/payments/initialize', { courseId: course.id, amount: 1 })).status).toBe(400);
    const init = await client.post('/payments/initialize', { courseId: course.id });
    expect(init.status).toBe(201);
    expect(init.body.amount).toBe(Number(course.approvedPrice));
    expect(init.body.authorizationUrl).toContain('/checkout/sandbox');
    const { reference } = init.body;

    // Returning to the success page without paying grants nothing.
    const early = await client.post('/payments/verify', { reference });
    expect(early.body).toMatchObject({ status: 'PENDING', entitlementGranted: false });
    expect((await client.get(`/learn/lessons/${premiumLesson}`)).status).toBe(403);

    await client.post(`/payments/sandbox/${reference}/complete`, { outcome: 'success' });
    const verified = await client.post('/payments/verify', { reference });
    expect(verified.body).toMatchObject({ status: 'SUCCESSFUL', entitlementGranted: true, alreadyProcessed: false });
    expect((await client.get(`/learn/lessons/${premiumLesson}`)).status).toBe(200);

    // Purchase does not bypass the prerequisite quiz.
    expect((await client.get(`/learn/lessons/${gatedLesson}`)).body.code).toBe('PREREQUISITE_NOT_COMPLETED');

    // Repeat verification and duplicate webhooks are no-ops.
    expect((await client.post('/payments/verify', { reference })).body.alreadyProcessed).toBe(true);
    const event = { event: 'charge.success', data: { id: `evt-${reference}`, reference } };
    expect((await webhook(event)).body).toEqual({ received: true });
    expect((await webhook(event)).body).toEqual({ received: true, duplicate: true });
    const trx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { reference } });
    expect(await prisma.financialLedgerEntry.count({ where: { transactionId: trx.id, type: 'SALE' } })).toBe(1);
    expect(await prisma.courseEntitlement.count({ where: { userId, courseId: course.id } })).toBe(1);

    // Cannot buy twice.
    expect((await client.post('/payments/initialize', { courseId: course.id })).body.code).toBe('ALREADY_OWNED');
  });

  it('rejects webhooks with a bad signature', async () => {
    const res = await webhook({ event: 'charge.success', data: { reference: 'x' } }, 'deadbeef');
    expect(res.status).toBe(403);
  });

  it('records failed payments without granting access', async () => {
    const { client, id: userId } = await registerVerified(app);
    const { body } = await client.post('/payments/initialize', { courseId: course.id });
    await client.post(`/payments/sandbox/${body.reference}/complete`, { outcome: 'failed' });
    const res = await client.post('/payments/verify', { reference: body.reference });
    expect(res.body).toMatchObject({ status: 'FAILED', entitlementGranted: false });
    expect(await prisma.courseEntitlement.count({ where: { userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId, type: 'payment.failed' } })).toBe(1);
  });

  it('refunds append reversing ledger entries and revoke access', async () => {
    const { client } = await registerVerified(app);
    const { body } = await client.post('/payments/initialize', { courseId: course.id });
    await client.post(`/payments/sandbox/${body.reference}/complete`, { outcome: 'success' });
    await client.post('/payments/verify', { reference: body.reference });
    const trx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { reference: body.reference } });

    expect((await client.post(`/admin/payments/${trx.id}/refund`, { reason: 'Customer request' })).status).toBe(403);
    expect((await admin.post(`/admin/payments/${trx.id}/refund`, { reason: 'Customer request' })).body.status).toBe('REFUNDED');
    const entries = await prisma.financialLedgerEntry.findMany({ where: { transactionId: trx.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => [e.type, Number(e.amount)])).toEqual([['SALE', 15000], ['REFUND', -15000]]);
    expect((await client.get(`/learn/lessons/${premiumLesson}`)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'payment.refund', resourceId: trx.id } })).toBe(1);
  });

  it('keeps payment administration away from learners', async () => {
    const learner = await loggedIn(app, 'chidi.eze@academy.local');
    expect((await learner.get('/admin/payments')).status).toBe(403);
    expect((await learner.get('/admin/finance/summary')).status).toBe(403);
    const list = await admin.get('/admin/payments?status=SUCCESSFUL');
    expect(list.status).toBe(200);
    expect(list.body.items.every((t: { status: string }) => t.status === 'SUCCESSFUL')).toBe(true);
    const csv = await admin.get('/admin/finance/ledger.csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('entry_id,created_at,type,amount');
  });
});
