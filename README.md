# Schutech Academy

A multi-subject learning platform: structured courses with gated modules, quizzes, a winding course journey, cross-course roadmaps, paid courses through Paystack, mentor support, verifiable certificates, a creator workspace and a full administrator dashboard.

The repository is an npm workspace with two apps.

```
cnergyacademy/
├── apps/
│   ├── api/          NestJS 11 · Prisma 6 · PostgreSQL. REST API under /api/v1
│   └── web/          Next.js 16 (App Router) · React 19 · TanStack Query · SCSS modules
├── docker-compose.yml   Local PostgreSQL 16 (+ academy_test database)
├── .env.example         Every environment variable, documented
└── IMPLEMENTATION_PROGRESS.md
```

## 1. Prerequisites

- Node.js 20.11 or newer (22 LTS recommended) and npm 10
- PostgreSQL 16. Docker is the easiest way to run it.

## 2. Installation

```bash
git clone https://github.com/nitoC/cnergyacademy && cd cnergyacademy
```

```bash
npm install
```

## 3. Environment setup

```bash
cp .env.example apps/api/.env
```

```bash
echo "API_INTERNAL_URL=http://localhost:4000" > apps/web/.env.local
```

For local development the API has safe fallbacks for `JWT_ACCESS_SECRET` and `WEB_URL` and uses the **sandbox** payment provider. In production it refuses to start without a strong secret, and it refuses the sandbox provider.

## 4. Database creation

```bash
docker compose up -d postgres
```

This creates the `academy` and `academy_test` databases. With your own PostgreSQL, create both databases and set `DATABASE_URL` / `TEST_DATABASE_URL`.

## 5–6. Prisma generation and migrations

```bash
npm run prisma:generate -w @academy/api
```

```bash
npm run db:migrate
```

`db:migrate` runs `prisma migrate deploy`, which only applies pending migrations and never drops data. To create a new migration during development, run `npm run prisma:migrate:dev -w @academy/api -- --name <change>`.

## 7. Seed data

```bash
npm run db:seed
```

The seed is idempotent: it looks every record up by a natural key, so it is safe to run repeatedly. It creates five subjects, eight courses in different states (with real lesson content and quizzes), two roadmaps, purchases (successful, failed and abandoned), learner progress, support conversations, a certificate and audit history.

Development accounts all use the password **`Academy2026!dev`**:

| Role | Email |
| --- | --- |
| Administrator | `admin@academy.local` |
| Creator | `ada.okafor@academy.local`, `tunde.bello@academy.local`, `grace.mensah@academy.local` |
| Mentor | `kemi.adeyemi@academy.local` |
| Learner (completed one course, bought another) | `chidi.eze@academy.local` |
| Learners | `amaka.obi@academy.local`, `femi.ajayi@academy.local` |
| Learner with a pending creator application | `zainab.musa@academy.local` |

A seeded certificate can be checked at `/verify/SEEDVERIFY01`. These credentials are public; never seed a production database.

## 8–9. Running the apps

Start the API and the web app in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

- Web app: <http://localhost:3000>
- API: <http://localhost:4000/api/v1> · health at `/api/v1/health`
- Swagger / OpenAPI: <http://localhost:4000/api/v1/docs> (disabled in production unless `SWAGGER_ENABLED=true`)

The browser only talks to the web origin. Next.js rewrites `/api/v1/*` to the API, so session cookies stay first-party.

**Emails in development.** No email provider is configured. Verification and password-reset emails are written as JSON files to `apps/api/storage/outbox/`; open the newest file to follow the link.

**Payments in development.** With `PAYMENT_PROVIDER=sandbox`, "Pay" sends you to `/checkout/sandbox`, which stands in for the provider's hosted checkout (approve, decline or cancel). The API still learns the outcome only through its server-side `verify` call, exactly as it does with Paystack.

## 10. Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| API unit | `npm run test:unit -w @academy/api` | Access policy, quiz scoring, course workflow, content sanitising, roadmap graph, progress, ledger, settings, permissions guard |
| API integration | `npm run test:integration -w @academy/api` | Full HTTP stack against `academy_test`: auth, refresh rotation and reuse detection, CSRF, approvals, pricing, gated learning, payments, webhooks, refunds, roles, audit, support privacy |
| Web components | `npm test -w @academy/web` | Safe lesson rendering, accessible select, journey, login form, redirect sanitising |
| End-to-end | `npm run test:e2e` | The 10 core user journeys, driven through the real UI with Playwright |

The integration suite **empties and re-seeds `academy_test`** on every run. It refuses to touch any database whose name does not end in `_test`.

The end-to-end suite needs the seeded development database, a built web app and both servers. Playwright starts them if they are not already running. Each run creates its own users and courses, so it can be repeated.

```bash
npm run build && npm run test:e2e
```

## 11. Production build

```bash
npm run build
```

```bash
npm run start -w @academy/api
```

```bash
npm run start -w @academy/web
```

`API_INTERNAL_URL` must be set **when building** the web app, because the `/api/v1` rewrite is compiled into the build.

The build downloads the Google fonts used by `next/font` and self-hosts them, so the build machine needs outbound access to Google Fonts. If a build fails with a `next/font/google` error, retry it or check the network.

## 12. Payment provider configuration (Paystack)

Paystack was chosen for the Nigerian launch: it settles in NGN, supports card, bank, USSD and transfer channels, provides a hosted checkout and a server-side verify endpoint, and signs webhooks with HMAC-SHA512.

1. Set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY=sk_test_…` (or `sk_live_…`).
2. In the Paystack dashboard, set the webhook URL to `https://<your-host>/api/v1/payments/webhook`.
3. The callback URL defaults to `${WEB_URL}/checkout/callback`; override it with `PAYMENT_CALLBACK_URL`.

How a purchase flows: the API reads the approved price from the database, creates a `PENDING` transaction with a unique reference and initialises checkout. When the learner returns (or a webhook arrives), the API calls Paystack's verify endpoint, checks amount and currency, and only then marks the transaction `SUCCESSFUL`, grants the entitlement and writes ledger entries, all in one database transaction. Status flips are conditional updates, and entitlements and ledger rows have unique constraints, so repeated callbacks and webhooks are harmless. Administrators can re-verify pending payments (**Payments → Reconcile pending**) and record refunds.

Refunds are processed in the Paystack dashboard first. **Record refund** then revokes access and writes reversing ledger entries; it does not call Paystack's refund API.

To add another provider (for example Flutterwave), implement `PaymentProvider` in `apps/api/src/payments/providers/` and register it in `payments.module.ts`.

## 13. Deployment considerations

- Run `npm run db:migrate` on every deploy, before the new API version starts.
- Terminate TLS in front of both apps, set `COOKIE_SECURE=true` (the production default) and `TRUST_PROXY=true` behind a proxy.
- Serve the web app and the API from the same site (for example `academy.example.com` and `api.academy.example.com`) so SameSite cookies work, or route `/api/v1` through the web app as in development.
- Configure a real email provider before launch. Add a transport behind `MailService`; the outbox transport is for development only.
- Media uses local disk (`STORAGE_LOCAL_ROOT`). For multiple instances, implement `StorageDriver` for S3, R2 or GCS, or mount shared storage.
- Rate limits are in-memory per instance. Use a shared store (for example Redis) for the throttler if you run several API instances.
- Logs are structured JSON on stdout; ship them to your log platform.
- Set a creator revenue share in **Admin → Settings** once the commercial model is agreed. Until then, sales are recorded gross and nothing is allocated.

## Architecture notes

- **Authorisation.** Roles are additive (`LEARNER`, `CREATOR`, `MENTOR`, `ADMIN`) and map to fine-grained permissions stored in the database. A global guard chain (rate limit → CSRF → authentication → permissions) protects every route. The user, roles and status are reloaded on each request, so suspensions and role changes take effect immediately. Nobody can change their own roles or status.
- **Sessions.** The access JWT (15 min) and the rotating refresh token (14 days, scoped to `/api/v1/auth`) are httpOnly cookies. A replayed refresh token revokes its whole session family. State-changing requests must carry an `x-academy-csrf` header, which cross-site forms cannot send.
- **Module access.** One policy function, `decideModuleAccess`, decides every lesson, quiz, journey and catalogue lock. Buying a course never skips a prerequisite quiz, and passing a quiz never grants premium access.
- **Content safety.** Lessons are typed blocks validated on the server and rendered as React elements. HTML is never injected, and links and images must be http(s) or platform media.
- **Progress.** Progress is derived from lesson-completion and quiz-pass rows by one function, so the dashboard, journey and course page always agree. Only `completedAt` is stored, and it is set in the same transaction that issues the certificate.
- **Roadmaps.** Every course has its own roadmap, created with the course and edited by its creator from the course editor's Roadmap tab. Module steps point at the course's modules, so their state follows the learner's real progress and access. A course cannot be submitted until its roadmap has steps and a valid structure; the roadmap is reviewed with the course and goes live when the course is published, visible to everyone whether or not they have paid. Administrators and creators can also publish learning paths that span several courses.
- **Themes.** Light and dark themes share one token set in `apps/web/src/styles/globals.scss` (light overrides live under `[data-theme='light']`). Visitors choose Light, Dark or System from the header; the choice is stored in their browser and applied by an inline script before first paint, so there is no flash. Illustrations (the hero map, course covers, certificates) are fixed artwork and look the same in both themes.
- **Audit.** Sensitive actions are written to an append-only `AuditLog`. There is no API to edit or delete it.
