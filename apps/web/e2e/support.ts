import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PASSWORD = 'Academy2026!dev';
const OUTBOX = process.env.E2E_OUTBOX_DIR ?? path.resolve(__dirname, '../../api/storage/outbox');

export const unique = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/');
}

export async function register(page: Page, name: string) {
  const email = `${unique('e2e')}@test.local`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/learn');
  return email;
}

/** Follows the verification link from the development mail outbox. */
export async function verifyEmail(page: Page, email: string) {
  let token: string | undefined;
  await expect.poll(() => {
    const files = readdirSync(OUTBOX).filter((f) => f.includes('verify-email')).sort().reverse();
    for (const f of files) {
      const m = JSON.parse(readFileSync(path.join(OUTBOX, f), 'utf8'));
      if (m.to === email) return (token = m.data.token);
    }
    return undefined;
  }).toBeTruthy();
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
}

/** Answer key for a quiz, read through an administrator API session (learners never receive it). */
export async function answerKey(request: APIRequestContext, quizId: string) {
  await request.post('/api/v1/auth/login', { data: { email: 'admin@academy.local', password: PASSWORD }, headers: { 'x-academy-csrf': '1' } });
  const quiz = await (await request.get(`/api/v1/creator/quizzes/${quizId}`)).json();
  return new Map<string, string[]>(quiz.questions.map((q: { prompt: string; options: { label: string; isCorrect: boolean }[] }) => [q.prompt, q.options.filter((o) => o.isCorrect).map((o) => o.label)]));
}

/** Answers every question of the attempt currently on screen and submits. */
export async function answerQuiz(page: Page, key: Map<string, string[]>) {
  for (;;) {
    const legend = (await page.locator('legend').innerText()).split('\n')[0].trim();
    for (const label of key.get(legend) ?? []) await page.getByLabel(label, { exact: true }).check();
    const next = page.getByRole('button', { name: 'Next question' });
    if (await next.isVisible()) await next.click();
    else break;
  }
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
}
