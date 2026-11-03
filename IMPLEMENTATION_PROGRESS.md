# Implementation progress

Status as of 2026-11-03. ✅ means implemented and verified by automated tests or by a recorded manual check (noted). ◐ means implemented with a stated limitation. "Manual" means the feature was exercised in the running app (a multi-role page sweep with no console or API errors) but has no dedicated automated test.

Test totals: API 85 (46 unit + 39 integration) · Web 13 component · E2E 5 Playwright specs covering the 10 required journeys. All pass on the last run.

## Decisions taken during implementation

| Decision | Why |
| --- | --- |
| The academy is its own repository and npm workspace | It was started inside the Genuslab blog repository and moved here with its history; it shares no code with the blog. |
| No Stitch or Figma designs were in the repository | The visual system was built from the written brief: dark green-black surfaces, forest primary, amber and terracotta signals, Fraunces / IBM Plex / Source Serif typography, tactile buttons, a generated contour-map illustration and generated course covers. |
| NestJS 11 + Prisma 6 (the newest majors are Nest 12 and Prisma 7) | Stable, well-understood majors. Prisma 7 changes client generation and requires driver adapters; adopting it can be a separate upgrade. |
| Next.js 16.2 with SCSS modules | Current stable Next major. SCSS modules were the stack the brief specified. |
| Paystack + a sandbox provider behind one `PaymentProvider` interface | Paystack fits a Nigerian launch. The sandbox is clearly labelled and is refused in production. |
| Cookie sessions + a CSRF header, API proxied through the web origin | httpOnly tokens, rotating refresh with reuse detection, and no cross-origin credential handling in the browser. |
| No `CourseVersion` model | Edits to a published course go live immediately; content is frozen only while the course is under review. Versioned re-review is listed under follow-up work. |

## Feature checklist

| Feature | DB | API | UI | Validation | AuthZ (server) | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Registration, login, logout | ✅ | ✅ | ✅ | ✅ DTO + zod | ✅ | integration + E2E | ✅ |
| Email verification | ✅ | ✅ | ✅ | ✅ single-use, 24 h | ✅ | integration | ◐ outbox transport only, no real email provider |
| Forgot / reset password | ✅ | ✅ | ✅ | ✅ 30 min, revokes sessions | ✅ | integration | ✅ |
| Refresh rotation, reuse detection, logout-all | ✅ | ✅ | ✅ | ✅ | ✅ | integration | ✅ |
| CSRF header, rate limiting, helmet, CORS | — | ✅ | ✅ | — | ✅ | integration (CSRF) | ✅ rate limits are per instance |
| Roles and permissions (additive, DB-backed) | ✅ | ✅ | ✅ | ✅ | ✅ guards + decorators | unit + integration | ✅ |
| Role assignment, no self-escalation, last-admin guard | ✅ | ✅ | ✅ | ✅ | ✅ | integration | ✅ |
| Account status and suspension | ✅ | ✅ | ✅ | ✅ | ✅ revokes sessions | integration | ✅ |
| Profile management | ✅ | ✅ | ✅ | ✅ explicit field list | ✅ | manual | ✅ |
| Creator applications and approval | ✅ | ✅ | ✅ | ✅ | ✅ | integration | ✅ |
| Subjects and categories (create, edit, reorder, archive) | ✅ | ✅ | ✅ | ✅ | ✅ | manual | ✅ |
| Course CRUD with slugs, outcomes, covers | ✅ | ✅ | ✅ | ✅ | ✅ owner or admin | integration + E2E | ✅ |
| Course status machine and review history | ✅ | ✅ | ✅ | ✅ readiness checks | ✅ no self-approval | unit + integration + E2E | ✅ |
| Price proposals, approval, history | ✅ | ✅ | ✅ | ✅ | ✅ no self-approval | integration | ✅ |
| Modules (CRUD, reorder, access policy, prerequisite quiz, publish) | ✅ | ✅ | ✅ | ✅ quiz must be outside the gated module | ✅ | integration | ✅ |
| Lessons (block editor, ordering, publish) | ✅ | ✅ | ✅ live preview | ✅ server sanitising | ✅ | unit + integration + E2E | ✅ |
| Centralised module access (`decideModuleAccess`) | — | ✅ | ✅ | — | ✅ every lesson and quiz request | unit + integration + E2E | ✅ |
| Quiz authoring (questions, options, explanations, policies) | ✅ | ✅ | ✅ | ✅ | ✅ | manual + integration (via seed) | ✅ single/multiple choice; schema allows more types |
| Quiz attempts and server-side scoring | ✅ | ✅ | ✅ | ✅ client scores rejected | ✅ | unit + integration + E2E | ✅ |
| Attempt limits, cooldown, feedback policies | ✅ | ✅ | ✅ | ✅ | ✅ | integration (limits) | ✅ cooldown has no dedicated test |
| Enrolment, progress, resume | ✅ | ✅ | ✅ | — | ✅ | unit + integration | ✅ |
| Course completion rules (configurable) | ✅ | ✅ | ✅ | ✅ | — | unit | ✅ |
| Winding course journey | — | ✅ server states | ✅ | — | ✅ | component + E2E | ✅ |
| Lesson reader | — | ✅ | ✅ | — | ✅ | E2E | ✅ |
| Payments: initialise, verify, webhooks, idempotency | ✅ | ✅ | ✅ | ✅ amount and currency checked | ✅ | integration + E2E (sandbox) | ◐ Paystack provider written to its API docs but not run against live Paystack (no credentials here) |
| Entitlements | ✅ | ✅ | ✅ | ✅ unique per learner and course | ✅ | integration + E2E | ✅ |
| Financial ledger, revenue share, CSV export, adjustments | ✅ | ✅ | ✅ | ✅ formula-injection safe CSV | ✅ | unit + integration | ✅ |
| Refunds and reconciliation | ✅ | ✅ | ✅ | ✅ | ✅ | integration (refund) | ◐ refunds are recorded, not pushed to Paystack |
| Roadmaps: graph model, cycle detection, validation | ✅ | ✅ | ✅ | ✅ | ✅ | unit + integration | ✅ |
| Roadmap review and publication | ✅ | ✅ | ✅ | ✅ | ✅ | integration | ✅ |
| Course roadmaps (one per course, authored by its creator, module steps follow progress, required for submission, public with the course) | ✅ | ✅ | ✅ | ✅ | ✅ creator or admin only | integration + E2E | ✅ |
| Roadmap view: spine-and-branch layout, step details panel | — | ✅ | ✅ | — | — | component + manual (desktop, mobile, both themes) | ✅ |
| Public course map (full journey visible before enrolling or paying; content still gated) | — | ✅ | ✅ | — | ✅ | integration + manual | ✅ |
| Learner roadmap progress and node actions | ✅ | ✅ | ✅ | — | ✅ | unit + integration | ✅ |
| Support threads, messages, unread, resolve and reopen | ✅ | ✅ | ✅ polling | ✅ | ✅ 404 for non-participants | integration | ✅ |
| Mentor assignment and reassignment | ✅ | ✅ | ✅ | ✅ | ✅ | manual | ✅ |
| Certificates: issue once, PDF, public verify, revoke | ✅ | ✅ | ✅ | ✅ | ✅ | integration + E2E | ✅ PDF generated on demand, not stored |
| Notifications: list, unread, mark read | ✅ | ✅ | ✅ | — | ✅ | integration | ✅ in-app; channel interface ready for email/SMS |
| Media uploads | ✅ | ✅ | ✅ | ✅ magic bytes, size, purpose | ✅ | manual | ◐ local disk driver only |
| Creator dashboard (status, learners, quiz performance, earnings, questions) | — | ✅ | ✅ | — | ✅ own courses | manual | ✅ |
| Admin overview with attention queue | — | ✅ live counts | ✅ | — | ✅ | integration | ✅ |
| Admin: users, creators, mentors, courses, subjects, roadmaps | ✅ | ✅ | ✅ | ✅ | ✅ | integration + manual | ✅ |
| Admin: payments, finance, learner reports | ✅ | ✅ | ✅ | ✅ | ✅ | integration + manual | ✅ |
| Admin: support oversight, certificates, settings, audit log | ✅ | ✅ | ✅ | ✅ whitelisted settings | ✅ append-only audit | integration | ✅ |
| Swagger / OpenAPI | — | ✅ | — | — | — | manual | ◐ request DTOs are documented; response schemas are mostly inferred |
| Seed data (idempotent) | ✅ | — | — | — | — | run twice, same counts | ✅ |
| Light and dark themes (Light / Dark / System switch, no flash on load) | — | — | ✅ | — | — | manual: both themes at 1360 px and 390 px, preference persists across reloads | ✅ |
| Responsive layout | — | — | ✅ | — | — | manual at 390 px and 1360 px | ◐ key pages checked; no device matrix |
| Accessibility | — | — | ✅ labels, keyboard select, focus rings, native dialogs | — | — | component tests | ◐ no formal axe or screen-reader audit yet |

## Known limitations and follow-up work

1. **Email delivery.** Add a provider transport (SES, Postmark, Resend…) behind `MailService`. The in-app notification channels are ready for an email or SMS channel.
2. **Live Paystack verification.** Run the checkout flow against Paystack test keys and a public webhook URL (for example via a tunnel). Optionally call Paystack's refund API from **Record refund**.
3. **Course versioning.** Edits to published courses go live immediately. A `CourseVersion` snapshot plus re-review would let creators stage changes.
4. **Object storage.** Add an S3-compatible `StorageDriver`, and let learners download private course resources (today only the owner and admins can).
5. **Scale.** The learner dashboard computes progress per enrolment (a few queries each), which is fine for normal enrolment counts but should be batched for heavy users. Use a shared rate-limit store when running several API instances.
6. **Editor ergonomics.** Reordering is by up and down buttons rather than drag and drop. Some destructive confirmations use the browser's native `confirm()`.
7. **Accessibility audit.** Run axe and a screen-reader pass across the admin tables and the journey view.
