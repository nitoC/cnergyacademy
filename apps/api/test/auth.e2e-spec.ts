import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client, P, PASSWORD, createApp, loggedIn, registerVerified, tokenFromOutbox, uniqueEmail } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const cookie = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0];

describe('Authentication & sessions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await createApp()));
  afterAll(() => app.close());

  it('registers a learner, sets httpOnly cookies and never grants privileged roles', async () => {
    const c = new Client(app);
    const email = uniqueEmail();
    const res = await c.post('/auth/register', { email, password: PASSWORD, fullName: 'Ada Learner' });
    expect(res.status).toBe(201);
    expect(res.body.roles).toEqual(['LEARNER']);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    const setCookie = ([] as string[]).concat(res.headers['set-cookie']);
    expect(setCookie.find((x) => x.startsWith('academy_at='))).toMatch(/HttpOnly/);
    expect(setCookie.find((x) => x.startsWith('academy_rt='))).toMatch(/Path=\/api\/v1\/auth/);
    expect((await c.get('/auth/me')).body.email).toBe(email);
  });

  it('rejects mass-assignment of roles at registration', async () => {
    const res = await new Client(app).post('/auth/register', { email: uniqueEmail(), password: PASSWORD, fullName: 'Sneaky', roles: ['ADMIN'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('enforces password strength and unique emails', async () => {
    const c = new Client(app);
    expect((await c.post('/auth/register', { email: uniqueEmail(), password: 'short', fullName: 'X Y' })).status).toBe(400);
    expect((await c.post('/auth/register', { email: 'chidi.eze@academy.local', password: PASSWORD, fullName: 'Dup' })).body.code).toBe('EMAIL_IN_USE');
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await request(app.getHttpServer()).post(`${P}/auth/login`).send({ email: 'chidi.eze@academy.local', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
  });

  it('rejects wrong passwords with a generic message', async () => {
    const res = await new Client(app).post('/auth/login', { email: 'chidi.eze@academy.local', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const c = new Client(app);
    const login = await c.post('/auth/login', { email: 'amaka.obi@academy.local', password: PASSWORD });
    const original = cookie(login, 'academy_rt')!;
    const rotated = await c.post('/auth/refresh');
    expect(rotated.status).toBe(200);
    expect(cookie(rotated, 'academy_rt')).not.toBe(original);

    // Attacker replays the original token.
    const replay = await request(app.getHttpServer()).post(`${P}/auth/refresh`).set('x-academy-csrf', '1').set('Cookie', original);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('SESSION_REVOKED');
    // The legitimate client's session family is now revoked too.
    expect((await c.post('/auth/refresh')).status).toBe(401);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('logs out and invalidates the session', async () => {
    const c = await loggedIn(app, 'femi.ajayi@academy.local');
    expect((await c.post('/auth/logout')).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('verifies email with a single-use token', async () => {
    const c = new Client(app);
    const email = uniqueEmail();
    await c.post('/auth/register', { email, password: PASSWORD, fullName: 'Verify Me' });
    const token = tokenFromOutbox(email, 'verify-email');
    expect((await c.post('/auth/verify-email', { token })).status).toBe(200);
    expect((await c.get('/auth/me')).body).toMatchObject({ emailVerified: true, status: 'ACTIVE' });
    expect((await c.post('/auth/verify-email', { token })).body.code).toBe('TOKEN_INVALID');
  });

  it('resets a password and signs out every existing session', async () => {
    const { client, email } = await registerVerified(app);
    const anon = new Client(app);
    expect((await anon.post('/auth/forgot-password', { email })).status).toBe(200);
    expect((await anon.post('/auth/forgot-password', { email: 'nobody@nowhere.test' })).status).toBe(200); // no enumeration
    const token = tokenFromOutbox(email, 'reset-password');
    expect((await anon.post('/auth/reset-password', { token, password: 'BrandNewPass99' })).status).toBe(200);
    expect((await client.get('/auth/me')).status).toBe(401);
    expect((await new Client(app).post('/auth/login', { email, password: 'BrandNewPass99' })).status).toBe(200);
  });

  it('blocks suspended accounts immediately, even with a live session', async () => {
    const { client, id } = await registerVerified(app);
    await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    const res = await client.get('/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_AUTHORIZED');
  });

  it('requires authentication for protected endpoints', async () => {
    const res = await new Client(app).get('/learn/dashboard');
    expect(res.status).toBe(401);
  });
});
