import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { APP_CONFIG, AppConfig } from '../src/config/configuration';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'Academy2026!dev';
export const P = '/api/v1';

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** A cookie-carrying browser-like client that always sends the CSRF header. */
export class Client {
  readonly agent: TestAgent;
  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  get(url: string) {
    return this.agent.get(P + url);
  }
  post(url: string, body?: object) {
    return this.agent.post(P + url).set('x-academy-csrf', '1').send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.agent.patch(P + url).set('x-academy-csrf', '1').send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent.put(P + url).set('x-academy-csrf', '1').send(body ?? {});
  }
  delete(url: string) {
    return this.agent.delete(P + url).set('x-academy-csrf', '1');
  }
  async login(email: string, password = PASSWORD) {
    const res = await this.post('/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return this;
  }
}

export async function loggedIn(app: INestApplication, email: string) {
  return new Client(app).login(email);
}

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now().toString(36)}.${counter++}@test.local`;
}

/** Reads the most recent outbox email for an address and returns its token. */
export function tokenFromOutbox(email: string, template: string): string {
  const dir = path.resolve(__dirname, '..', 'storage/test-outbox');
  const files = readdirSync(dir).filter((f) => f.includes(template)).sort().reverse();
  for (const f of files) {
    const msg = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    if (msg.to === email) return msg.data.token;
  }
  throw new Error(`No ${template} email for ${email}`);
}

export async function registerVerified(app: INestApplication, name = 'Test Learner') {
  const client = new Client(app);
  const email = uniqueEmail();
  const res = await client.post('/auth/register', { email, password: PASSWORD, fullName: name });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  const v = await client.post('/auth/verify-email', { token: tokenFromOutbox(email, 'verify-email') });
  if (v.status !== 200) throw new Error('verify failed');
  return { client, email, id: res.body.id as string };
}
