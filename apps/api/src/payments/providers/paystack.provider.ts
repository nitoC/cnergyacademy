import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { InitializeInput, InitializeResult, PaymentProvider, ProviderError, VerifyResult, WebhookEvent } from './payment-provider';

/**
 * Paystack (https://paystack.com/docs/api). Chosen for the Nigerian launch:
 * NGN settlement, card/bank/USSD/transfer channels, a hosted checkout and a
 * server-side verify endpoint. Webhooks are signed with HMAC-SHA512 of the
 * raw body using the secret key (header `x-paystack-signature`).
 */
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  private readonly logger = new Logger('Paystack');

  constructor(private readonly secretKey: string, private readonly baseUrl: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderError(`Paystack unreachable: ${(err as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
    if (!res.ok || body.status === false) {
      this.logger.warn({ msg: 'Paystack error', status: res.status, message: body.message, path });
      throw new ProviderError(body.message ?? `Paystack responded ${res.status}`, res.status >= 500);
    }
    return body.data as T;
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const data = await this.call<{ authorization_url: string; reference: string }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    return { authorizationUrl: data.authorization_url, providerReference: data.reference };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const data = await this.call<{ status: string; amount: number; currency: string; paid_at?: string; channel?: string; gateway_response?: string }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const status = data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : data.status === 'abandoned' ? 'abandoned' : 'pending';
    return {
      status,
      amountMinor: data.amount,
      currency: data.currency,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      channel: data.channel,
      gatewayResponse: data.gateway_response,
      raw: data,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const signature = headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !rawBody?.length) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): WebhookEvent | null {
    const b = body as { event?: string; data?: { id?: number | string; reference?: string } };
    if (!b?.event) return null;
    const reference = b.data?.reference ?? null;
    return { eventKey: `paystack:${b.event}:${b.data?.id ?? reference}`, type: b.event, reference, raw: body };
  }
}
