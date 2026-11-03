import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InitializeInput, InitializeResult, PaymentProvider, ProviderError, VerifyResult, WebhookEvent } from './payment-provider';

/**
 * Local development provider. It behaves like a hosted checkout: the
 * learner is sent to /checkout/sandbox where they choose an outcome, which
 * is recorded in SandboxCharge (the "provider side"). The API then learns
 * the outcome only through `verify()`, exactly as with Paystack. Refused at
 * boot in production.
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';

  constructor(private readonly prisma: PrismaService, private readonly webUrl: string, private readonly signingSecret: string) {}

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    await this.prisma.sandboxCharge.create({ data: { reference: input.reference, amount: input.amountMinor / 100, currency: input.currency } });
    const url = new URL('/checkout/sandbox', this.webUrl);
    url.searchParams.set('reference', input.reference);
    url.searchParams.set('callback', input.callbackUrl);
    return { authorizationUrl: url.toString(), providerReference: input.reference };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const charge = await this.prisma.sandboxCharge.findUnique({ where: { reference } });
    if (!charge) throw new ProviderError('Unknown sandbox reference', false);
    return {
      status: charge.status === 'success' ? 'success' : charge.status === 'failed' ? 'failed' : charge.status === 'abandoned' ? 'abandoned' : 'pending',
      amountMinor: Math.round(Number(charge.amount) * 100),
      currency: charge.currency,
      paidAt: charge.status === 'success' ? charge.updatedAt : undefined,
      channel: 'sandbox',
      raw: charge,
    };
  }

  /** Simulates the provider recording the shopper's decision on its checkout page. */
  async complete(reference: string, outcome: 'success' | 'failed' | 'abandoned') {
    const charge = await this.prisma.sandboxCharge.findUnique({ where: { reference } });
    if (!charge) throw new ProviderError('Unknown sandbox reference', false);
    if (charge.status !== 'pending') return charge;
    return this.prisma.sandboxCharge.update({ where: { reference }, data: { status: outcome } });
  }

  sign(rawBody: Buffer) {
    return createHmac('sha512', this.signingSecret).update(rawBody).digest('hex');
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const signature = headers['x-sandbox-signature'];
    if (typeof signature !== 'string' || !rawBody?.length) return false;
    const a = Buffer.from(this.sign(rawBody), 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): WebhookEvent | null {
    const b = body as { event?: string; data?: { reference?: string; id?: string } };
    if (!b?.event) return null;
    return { eventKey: `sandbox:${b.event}:${b.data?.id ?? b.data?.reference}`, type: b.event, reference: b.data?.reference ?? null, raw: body };
  }
}
