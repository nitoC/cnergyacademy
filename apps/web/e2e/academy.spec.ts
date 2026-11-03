import { expect, test } from '@playwright/test';
import { answerKey, answerQuiz, login, logout, register, unique, verifyEmail } from './support';

test.describe.configure({ mode: 'serial' });

test('1. a user registers, signs out and signs back in', async ({ page }) => {
  const email = await register(page, 'Ngozi Test');
  await expect(page.getByRole('heading', { name: /Good to see you, Ngozi/ })).toBeVisible();
  await logout(page);
  await login(page, email);
  await expect(page).toHaveURL(/\/learn$/);
});

test('2–4. a learner discovers a free course, completes a lesson and passes a quiz', async ({ page, request }) => {
  await register(page, 'Discovery Learner');
  await page.goto('/courses');
  await page.getByPlaceholder('Search by topic, skill or instructor').fill('Foundations');
  await page.getByRole('link', { name: /Foundations of Software Engineering/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Foundations of Software Engineering' })).toBeVisible();
  await page.getByRole('button', { name: 'Enrol and start' }).click();
  await page.waitForURL(/\/learn\/courses\//);

  // The third module is locked behind the second module's quiz.
  await expect(page.getByRole('button', { name: /Module: Changing code safely\. Pass the prerequisite quiz/ })).toBeVisible();

  await page.getByRole('link', { name: 'Resume where you left off' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What a requirement really asks for' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark complete & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Decomposing work into thin slices' })).toBeVisible();
  await page.getByRole('button', { name: /Mark complete & take the checkpoint|Mark complete & continue/ }).click();
  await page.waitForURL(/\/learn\/quizzes\//);
  const quizId = page.url().split('/learn/quizzes/')[1];

  await page.getByRole('button', { name: 'Start quiz' }).click();
  await answerQuiz(page, await answerKey(request, quizId));
  await expect(page.getByText('100%')).toBeVisible();
  await expect(page.getByText(/Passed · pass mark/)).toBeVisible();
});

test('5–7. a premium purchase is verified, grants access and keeps prerequisites', async ({ page }) => {
  const email = await register(page, 'Premium Buyer');
  await verifyEmail(page, email);
  await page.goto('/courses/production-ready-apis-with-nodejs');
  await page.getByRole('link', { name: 'Buy the full course' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await page.getByRole('button', { name: /Pay ₦15,000/ }).click();

  // Hosted (sandbox) provider page.
  await page.waitForURL(/\/checkout\/sandbox/);
  await expect(page.getByText('Sandbox payment provider')).toBeVisible();
  await page.getByRole('button', { name: 'Approve payment' }).click();

  await page.waitForURL(/\/checkout\/callback/);
  await expect(page.getByRole('heading', { name: 'You’re in.' }).or(page.getByRole('heading', { name: "You're in." }))).toBeVisible();
  await page.getByRole('link', { name: 'Continue to the course' }).click();

  await expect(page.getByRole('button', { name: /Module: Validation and data integrity\. (Available|Upcoming|Up next)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Module: Operating in production\. Pass the prerequisite quiz/ })).toBeVisible();
  await page.getByRole('button', { name: /Lesson: Validate at the edge, enforce in the core/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Validate at the edge, enforce in the core' })).toBeVisible();

  await page.goto('/learn/purchases');
  await expect(page.getByRole('cell', { name: /Production-Ready APIs/ })).toBeVisible();
  await expect(page.getByText('Successful')).toBeVisible();
});

test('8–9. a creator builds and submits a course; an administrator approves and publishes it', async ({ page }) => {
  const title = `Field Notes ${unique('c')}`;
  await login(page, 'ada.okafor@academy.local');
  await page.goto('/creator/courses/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Short description').fill('A short course written by the end-to-end suite.');
  await page.getByRole('combobox', { name: 'Subject' }).click();
  await page.getByRole('option', { name: 'Software Engineering' }).click();
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.waitForURL(/tab=curriculum/);

  await page.getByRole('button', { name: 'Add module' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('Getting started');
  await page.getByRole('dialog').getByRole('button', { name: 'Save module' }).click();
  await page.getByRole('button', { name: 'Lesson', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Lesson title').fill('Your first field note');
  await page.getByRole('dialog').getByRole('button', { name: 'Create and write' }).click();
  await page.waitForURL(/\/lessons\//);
  await page.getByRole('button', { name: '+ Paragraph' }).click();
  await page.getByRole('textbox', { name: 'Paragraph' }).fill('Write down **what you expected** before you run anything.');
  await page.getByLabel('Published to learners').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Lesson saved')).toBeVisible();
  await expect(page.getByLabel('Preview').getByText('what you expected')).toBeVisible();

  await page.getByRole('link', { name: 'Getting started' }).click();
  await page.getByRole('tab', { name: 'Details' }).click();
  await page.getByLabel('Full description').fill('Learners practise recording expectations before experiments, then compare them with outcomes.');
  await page.getByRole('textbox', { name: 'Outcome 1' }).fill('Record expectations before testing');
  await page.getByRole('button', { name: 'Add outcome' }).click();
  await page.getByRole('textbox', { name: 'Outcome 2' }).fill('Compare outcomes with expectations');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Course details saved')).toBeVisible();
  await page.getByRole('tab', { name: 'Review & publish' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('This course is with an administrator for review')).toBeVisible();
  await logout(page);

  await login(page, 'admin@academy.local');
  await page.goto('/admin/courses?status=SUBMITTED');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  await page.goto(`/courses?search=${encodeURIComponent(title)}`);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});

test('10. a learner completes a course and receives a verifiable certificate', async ({ page, request }) => {
  await register(page, 'Certified Learner');
  await page.goto('/courses/consulting-communication-for-engineers');
  await page.getByRole('button', { name: 'Enrol and start' }).click();
  await page.getByRole('link', { name: 'Resume where you left off' }).click();
  await page.getByRole('button', { name: 'Mark complete & take the checkpoint' }).click();
  await page.waitForURL(/\/learn\/quizzes\//);
  const quizId = page.url().split('/learn/quizzes/')[1];
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await answerQuiz(page, await answerKey(request, quizId));
  await expect(page.getByText(/certificate GA-\d{4}-\w+ has been issued/)).toBeVisible();

  await page.goto('/learn/certificates');
  const row = page.getByRole('row', { name: /Consulting Communication for Engineers/ });
  await expect(row).toBeVisible();
  const code = await row.getByRole('link').first().innerText();
  await page.goto(`/verify/${code}`);
  await expect(page.getByText('VERIFIED CERTIFICATE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Certified Learner' })).toBeVisible();
});
