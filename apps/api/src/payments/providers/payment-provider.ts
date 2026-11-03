/**
 * Provider-agnostic payment contract. Amounts are integers in the minor
 * unit (kobo for NGN). The application never trusts a client redirect: it
 * only acts on `verify()` (server-to-provider) or a signature-verified
 * webhook followed by `verify()`.
 */
export type ProviderChargeStatus = 'success' | 'failed' | 'abandoned' | 'pending';

export interface InitializeInput {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface InitializeResult {
  authorizationUrl: string;
  providerReference?: string;
}

export interface VerifyResult {
  status: ProviderChargeStatus;
  amountMinor: number;
  currency: string;
  paidAt?: Date;
  channel?: string;
  gatewayResponse?: string;
  raw: unknown;
}

export interface WebhookEvent {
  eventKey: string;
  type: string;
  reference: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): WebhookEvent | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class ProviderError extends Error {
  constructor(message: string, readonly retriable = true) {
    super(message);
  }
}
