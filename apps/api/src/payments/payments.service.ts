import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { paginate, PaginationQueryDto, skipTake } from '../common/pagination';
import { randomCode } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import { PAYMENT_PROVIDER, PaymentProvider, ProviderError, VerifyResult } from './providers/payment-provider';

export interface SettlementOutcome {
  reference: string;
  status: PaymentStatus;
  courseId: string;
  entitlementGranted: boolean;
  alreadyProcessed: boolean;
}

const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);

/**
 * Splits a sale into ledger entries. With no revenue share configured the
 * sale is recorded gross and nothing is allocated — administrators decide
 * the model later via `finance.creatorSharePercent`.
 */
export function ledgerEntriesForSale(amount: Prisma.Decimal, sharePercent: number | null) {
  const entries: { type: 'SALE' | 'CREATOR_EARNING' | 'PLATFORM_REVENUE'; amount: Prisma.Decimal; sharePercent: Prisma.Decimal | null }[] = [
    { type: 'SALE', amount, sharePercent: null },
  ];
  if (sharePercent !== null) {
    const creator = amount.mul(sharePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    entries.push({ type: 'CREATOR_EARNING', amount: creator, sharePercent: D(sharePercent) });
    entries.push({ type: 'PLATFORM_REVENUE', amount: amount.minus(creator), sharePercent: D(100 - sharePercent) });
  }
  return entries;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  // ───────────── Checkout ─────────────

  /** Price and availability come from the database, never from the client. */
  async initialize(user: AuthUser, courseId: string) {
    if (!user.permissions.has('courses.learn')) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not permitted' });
    if ((await this.settings.get('payments.requireVerifiedEmail')) && !user.emailVerified) {
      throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before purchasing' });
    }
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, status: true, approvedPrice: true, currency: true, creatorId: true } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException({ code: 'COURSE_NOT_PUBLISHED', message: 'This course is not available for purchase' });
    if (!course.approvedPrice || course.approvedPrice.lte(0)) throw new BadRequestException({ code: 'COURSE_IS_FREE', message: 'This course is free — no purchase needed' });
    if (course.creatorId === user.id) throw new BadRequestException({ code: 'OWN_COURSE', message: 'You cannot buy your own course' });

    const entitlement = await this.prisma.courseEntitlement.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    if (entitlement && !entitlement.revokedAt) throw new ConflictException({ code: 'ALREADY_OWNED', message: 'You already own this course' });

    // Reuse a recent pending checkout for the same price instead of creating duplicates.
    const recent = await this.prisma.paymentTransaction.findFirst({
      where: { userId: user.id, courseId, status: 'PENDING', amount: course.approvedPrice, provider: this.provider.name, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent?.authorizationUrl) {
      return { reference: recent.reference, authorizationUrl: recent.authorizationUrl, amount: Number(recent.amount), currency: recent.currency, provider: recent.provider };
    }

    const reference = `CA-${Date.now().toString(36).toUpperCase()}-${randomCode(8)}`;
    const trx = await this.prisma.paymentTransaction.create({
      data: { reference, userId: user.id, courseId, provider: this.provider.name, amount: course.approvedPrice, currency: course.currency },
    });
    try {
      const init = await this.provider.initialize({
        reference,
        amountMinor: Math.round(Number(course.approvedPrice) * 100),
        currency: course.currency,
        email: user.email,
        callbackUrl: this.config.payments.callbackUrl,
        metadata: { courseId, userId: user.id, transactionId: trx.id },
      });
      await this.prisma.paymentTransaction.update({ where: { id: trx.id }, data: { authorizationUrl: init.authorizationUrl, providerReference: init.providerReference } });
      return { reference, authorizationUrl: init.authorizationUrl, amount: Number(course.approvedPrice), currency: course.currency, provider: this.provider.name };
    } catch (err) {
      await this.prisma.paymentTransaction.update({ where: { id: trx.id }, data: { status: 'FAILED', failureReason: `INITIALIZE_FAILED: ${(err as Error).message}`.slice(0, 500) } });
      this.logger.error({ msg: 'initialize failed', reference, err: (err as Error).message });
      throw new BadGatewayException({ code: 'PROVIDER_UNAVAILABLE', message: 'The payment provider could not start checkout. Please try again.' });
    }
  }

  /** Called by the learner's browser after returning from checkout. Verifies with the provider before acting. */
  async verifyForUser(user: AuthUser, reference: string) {
    const trx = await this.prisma.paymentTransaction.findUnique({ where: { reference } });
    if (!trx || trx.userId !== user.id) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    const outcome = await this.verifyAndSettle(reference, 'callback');
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: trx.courseId }, select: { id: true, slug: true, title: true } });
    return { ...outcome, course };
  }

  async verifyAndSettle(reference: string, source: 'callback' | 'webhook' | 'reconcile', actorId?: string): Promise<SettlementOutcome> {
    const trx = await this.prisma.paymentTransaction.findUnique({ where: { reference } });
    if (!trx) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    if (trx.status === 'SUCCESSFUL' || trx.status === 'REFUNDED') {
      return { reference, status: trx.status, courseId: trx.courseId, entitlementGranted: trx.status === 'SUCCESSFUL', alreadyProcessed: true };
    }
    let verification: VerifyResult;
    try {
      verification = await this.provider.verify(reference);
    } catch (err) {
      if (err instanceof ProviderError) {
        this.logger.warn({ msg: 'verify failed', reference, err: err.message });
        throw new BadGatewayException({ code: 'PROVIDER_UNAVAILABLE', message: 'Could not confirm the payment yet. We will keep checking.' });
      }
      throw err;
    }
    return this.settle(reference, verification, source, actorId);
  }

  /**
   * Applies a provider verification. Idempotent and race-safe:
   *  - the status flip uses a conditional update, so only one caller wins;
   *  - entitlement is unique per (user, course) and per transaction;
   *  - ledger entries are unique per (transaction, type).
   */
  async settle(reference: string, v: VerifyResult, source: string, actorId?: string): Promise<SettlementOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const trx = await tx.paymentTransaction.findUniqueOrThrow({ where: { reference }, include: { course: { select: { title: true, creatorId: true, slug: true } } } });
      const base = { reference, courseId: trx.courseId };
      await tx.paymentEvent.create({
        data: { transactionId: trx.id, provider: this.provider.name, eventKey: `verify:${reference}:${Date.now()}:${randomCode(4)}`, type: `verify.${source}.${v.status}`, payload: toJson(v.raw) },
      });
      if (trx.status === 'SUCCESSFUL' || trx.status === 'REFUNDED') {
        return { ...base, status: trx.status, entitlementGranted: trx.status === 'SUCCESSFUL', alreadyProcessed: true };
      }
      await tx.paymentTransaction.update({ where: { id: trx.id }, data: { lastReconciledAt: source === 'reconcile' ? new Date() : undefined } });

      if (v.status === 'pending') return { ...base, status: trx.status, entitlementGranted: false, alreadyProcessed: false };

      if (v.status === 'success') {
        const expectedMinor = Math.round(Number(trx.amount) * 100);
        if (v.amountMinor !== expectedMinor || v.currency !== trx.currency) {
          await tx.paymentTransaction.update({
            where: { id: trx.id },
            data: { status: 'FAILED', failureReason: `AMOUNT_MISMATCH expected ${expectedMinor} ${trx.currency}, got ${v.amountMinor} ${v.currency}`, verifiedAt: new Date(), providerPayload: toJson(v.raw) },
          });
          await this.audit.record({ actorId, action: 'payment.amount_mismatch', resourceType: 'PaymentTransaction', resourceId: trx.id, outcome: 'FAILED', metadata: { reference, expectedMinor, got: v.amountMinor } }, tx);
          return { ...base, status: 'FAILED', entitlementGranted: false, alreadyProcessed: false };
        }
        const claimed = await tx.paymentTransaction.updateMany({
          where: { id: trx.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
          data: { status: 'SUCCESSFUL', verifiedAt: new Date(), paidAt: v.paidAt ?? new Date(), channel: v.channel, providerPayload: toJson(v.raw), failureReason: null },
        });
        if (!claimed.count) return { ...base, status: 'SUCCESSFUL', entitlementGranted: true, alreadyProcessed: true };

        const existing = await tx.courseEntitlement.findUnique({ where: { userId_courseId: { userId: trx.userId, courseId: trx.courseId } } });
        if (existing && !existing.revokedAt) {
          // Paid twice for the same course: keep the original entitlement and flag for refund.
          await tx.paymentTransaction.update({ where: { id: trx.id }, data: { failureReason: 'DUPLICATE_PURCHASE: learner already owned this course; refund recommended' } });
          await this.audit.record({ action: 'payment.duplicate', resourceType: 'PaymentTransaction', resourceId: trx.id, outcome: 'FAILED', metadata: { reference } }, tx);
        } else if (existing) {
          await tx.courseEntitlement.update({ where: { id: existing.id }, data: { revokedAt: null, revokeReason: null, transactionId: trx.id, source: 'PURCHASE', grantedAt: new Date() } });
        } else {
          await tx.courseEntitlement.create({ data: { userId: trx.userId, courseId: trx.courseId, transactionId: trx.id, source: 'PURCHASE' } });
        }
        await tx.courseEnrollment.upsert({
          where: { userId_courseId: { userId: trx.userId, courseId: trx.courseId } },
          create: { userId: trx.userId, courseId: trx.courseId },
          update: { lastActivityAt: new Date() },
        });
        const share = await this.settings.get('finance.creatorSharePercent', tx);
        await tx.financialLedgerEntry.createMany({
          data: ledgerEntriesForSale(trx.amount, share).map((e) => ({
            transactionId: trx.id,
            courseId: trx.courseId,
            creatorId: trx.course.creatorId,
            type: e.type,
            amount: e.amount,
            sharePercent: e.sharePercent,
            currency: trx.currency,
            memo: `Sale ${reference}`,
          })),
          skipDuplicates: true,
        });
        await this.audit.record({ actorId, action: 'payment.succeeded', resourceType: 'PaymentTransaction', resourceId: trx.id, metadata: { reference, source, amount: Number(trx.amount) } }, tx);
        await this.notifications.notify(trx.userId, { type: 'payment.succeeded', title: `You now own ${trx.course.title}`, body: `Payment ${reference} confirmed.`, link: `/learn/courses/${trx.courseId}` }, tx);
        return { ...base, status: 'SUCCESSFUL', entitlementGranted: true, alreadyProcessed: false };
      }

      // failed / abandoned
      const next: PaymentStatus = v.status === 'abandoned' ? 'CANCELLED' : 'FAILED';
      const claimed = await tx.paymentTransaction.updateMany({
        where: { id: trx.id, status: 'PENDING' },
        data: { status: next, verifiedAt: new Date(), failureReason: v.gatewayResponse ?? (next === 'CANCELLED' ? 'Checkout abandoned' : 'Payment declined'), providerPayload: toJson(v.raw) },
      });
      if (claimed.count && next === 'FAILED') {
        await this.notifications.notify(trx.userId, { type: 'payment.failed', title: `Payment for ${trx.course.title} did not go through`, body: v.gatewayResponse ?? 'No money was taken. You can try again.', link: `/courses/${trx.course.slug}` }, tx);
      }
      return { ...base, status: claimed.count ? next : trx.status, entitlementGranted: false, alreadyProcessed: !claimed.count };
    });
  }

  /** Signature-verified webhook. Unknown or replayed events are acknowledged without side effects. */
  async handleWebhook(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, body: unknown) {
    if (!rawBody || !this.provider.verifyWebhookSignature(rawBody, headers)) {
      this.logger.warn({ msg: 'webhook signature rejected' });
      throw new ForbiddenException({ code: 'INVALID_SIGNATURE', message: 'Invalid signature' });
    }
    const event = this.provider.parseWebhook(body);
    if (!event) return { received: true, ignored: 'unparseable' };
    const trx = event.reference ? await this.prisma.paymentTransaction.findUnique({ where: { reference: event.reference } }) : null;
    try {
      await this.prisma.paymentEvent.create({
        data: { transactionId: trx?.id, provider: this.provider.name, eventKey: event.eventKey, type: event.type, payload: toJson(event.raw) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { received: true, duplicate: true };
      throw err;
    }
    if (!trx) return { received: true, ignored: 'unknown reference' };
    if (event.type === 'charge.success' || event.type === 'charge.failed') {
      // Never trust the webhook body for the outcome; re-verify with the provider.
      await this.verifyAndSettle(trx.reference, 'webhook').catch((err) => {
        this.logger.warn({ msg: 'webhook verify deferred', reference: trx.reference, err: String(err) });
      });
    }
    return { received: true };
  }

  sandboxProvider() {
    if (this.provider.name !== 'sandbox' || this.config.isProduction) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not available' });
    }
    return this.provider as unknown as import('./providers/sandbox.provider').SandboxProvider;
  }

  async sandboxCharge(user: AuthUser, reference: string) {
    this.sandboxProvider();
    const trx = await this.prisma.paymentTransaction.findUnique({ where: { reference }, include: { course: { select: { title: true } } } });
    if (!trx || trx.userId !== user.id) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    const charge = await this.prisma.sandboxCharge.findUnique({ where: { reference } });
    return { reference, amount: Number(trx.amount), currency: trx.currency, courseTitle: trx.course.title, chargeStatus: charge?.status ?? 'missing', email: user.email };
  }

  async sandboxComplete(user: AuthUser, reference: string, outcome: 'success' | 'failed' | 'abandoned') {
    const sandbox = this.sandboxProvider();
    const trx = await this.prisma.paymentTransaction.findUnique({ where: { reference } });
    if (!trx || trx.userId !== user.id) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    await sandbox.complete(reference, outcome);
    return { reference, outcome };
  }

  myTransactions(userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, amount: true, currency: true, status: true, createdAt: true, paidAt: true, failureReason: true, course: { select: { id: true, title: true, slug: true } } },
    });
  }

  // ───────────── Administration ─────────────

  async adminList(q: PaginationQueryDto & { status?: PaymentStatus; flagged?: boolean }) {
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.flagged ? { failureReason: { not: null } } : {}),
      ...(q.search
        ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { user: { email: { contains: q.search, mode: 'insensitive' } } }, { course: { title: { contains: q.search, mode: 'insensitive' } } }] }
        : {}),
    };
    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: q.order },
        ...skipTake(q),
        select: {
          id: true, reference: true, amount: true, currency: true, status: true, provider: true, createdAt: true, paidAt: true, failureReason: true,
          user: { select: { id: true, fullName: true, email: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true }, orderBy: { status: 'asc' } }),
    ]);
    return {
      ...paginate(items, total, q),
      summary: summary.map((s) => ({ status: s.status, count: (s._count as { _all: number })._all, amount: Number((s._sum as { amount: Prisma.Decimal | null }).amount ?? 0) })),
    };
  }

  async adminDetail(id: string) {
    const trx = await this.prisma.paymentTransaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true, creator: { select: { fullName: true } } } },
        entitlement: true,
        ledgerEntries: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { receivedAt: 'desc' }, take: 50 },
      },
    });
    if (!trx) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    return trx;
  }

  async reconcile(actor: AuthUser, id: string) {
    const trx = await this.prisma.paymentTransaction.findUnique({ where: { id } });
    if (!trx) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    const outcome = await this.verifyAndSettle(trx.reference, 'reconcile', actor.id);
    await this.audit.record({ actorId: actor.id, action: 'payment.reconcile', resourceType: 'PaymentTransaction', resourceId: id, metadata: { reference: trx.reference, status: outcome.status } });
    return outcome;
  }

  /** Re-verifies every pending transaction older than 10 minutes. */
  async reconcilePending(actor: AuthUser) {
    const pending = await this.prisma.paymentTransaction.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      take: 100,
      select: { reference: true },
    });
    const results: { reference: string; status: string; error?: string }[] = [];
    for (const p of pending) {
      try {
        const r = await this.verifyAndSettle(p.reference, 'reconcile', actor.id);
        results.push({ reference: p.reference, status: r.status });
      } catch (err) {
        results.push({ reference: p.reference, status: 'ERROR', error: (err as Error).message });
      }
    }
    await this.audit.record({ actorId: actor.id, action: 'payment.reconcile_batch', resourceType: 'PaymentTransaction', metadata: { checked: results.length } });
    return { checked: results.length, results };
  }

  /**
   * Records a refund that has been processed with the provider (Paystack
   * dashboard or refund API). Revokes access and writes reversing ledger
   * entries; the original entries are never modified.
   */
  async refund(actor: AuthUser, id: string, reason: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const trx = await tx.paymentTransaction.findUnique({ where: { id }, include: { ledgerEntries: true, course: { select: { title: true } } } });
      if (!trx) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
      const claimed = await tx.paymentTransaction.updateMany({ where: { id, status: 'SUCCESSFUL' }, data: { status: 'REFUNDED', refundedAt: new Date() } });
      if (!claimed.count) throw new ConflictException({ code: 'NOT_REFUNDABLE', message: 'Only successful payments can be refunded' });
      await tx.courseEntitlement.updateMany({ where: { transactionId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: `Refunded: ${reason}` } });
      await this.writeReversals(tx, trx, reason);
      await this.audit.record({ actorId: actor.id, action: 'payment.refund', resourceType: 'PaymentTransaction', resourceId: id, ipAddress: ip, metadata: { reference: trx.reference, amount: Number(trx.amount), reason } }, tx);
      await this.notifications.notify(trx.userId, { type: 'payment.refunded', title: `Refund recorded for ${trx.course.title}`, body: reason, link: '/learn/purchases' }, tx);
      return { status: 'REFUNDED' };
    });
  }

  private async writeReversals(tx: Tx, trx: { id: string; courseId: string; currency: string; reference: string; ledgerEntries: { type: string; amount: Prisma.Decimal; creatorId: string | null }[] }, reason: string) {
    const map: Record<string, 'REFUND' | 'CREATOR_EARNING_REVERSAL' | 'PLATFORM_REVENUE_REVERSAL'> = {
      SALE: 'REFUND',
      CREATOR_EARNING: 'CREATOR_EARNING_REVERSAL',
      PLATFORM_REVENUE: 'PLATFORM_REVENUE_REVERSAL',
    };
    await tx.financialLedgerEntry.createMany({
      data: trx.ledgerEntries
        .filter((e) => map[e.type])
        .map((e) => ({ transactionId: trx.id, courseId: trx.courseId, creatorId: e.creatorId, type: map[e.type], amount: e.amount.neg(), currency: trx.currency, memo: `Refund ${trx.reference}: ${reason}`.slice(0, 300) })),
      skipDuplicates: true,
    });
  }

  /** Manual ledger adjustment (e.g. chargeback fee). Audited, append-only. */
  async adjustment(actor: AuthUser, dto: { amount: number; currency: string; memo: string; creatorId?: string; courseId?: string }) {
    if (!dto.amount) throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Amount cannot be zero' });
    const entry = await this.prisma.financialLedgerEntry.create({
      data: { type: 'ADJUSTMENT', amount: D(dto.amount), currency: dto.currency, memo: dto.memo, creatorId: dto.creatorId, courseId: dto.courseId },
    });
    await this.audit.record({ actorId: actor.id, action: 'payment.adjustment', resourceType: 'FinancialLedgerEntry', resourceId: entry.id, metadata: dto });
    return entry;
  }
}

function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? null)) ?? {};
}
