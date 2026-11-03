/**
 * Typed, validated runtime configuration. Every value comes from the
 * environment; nothing secret is hardcoded. Fails fast on boot when a
 * required variable is missing.
 */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  webUrl: string;
  corsOrigins: string[];
  jwt: { accessSecret: string; accessTtlSeconds: number; refreshTtlDays: number };
  cookies: { secure: boolean; domain?: string };
  payments: {
    provider: 'paystack' | 'sandbox';
    paystackSecretKey?: string;
    paystackBaseUrl: string;
    callbackUrl: string;
  };
  storage: { driver: 'local'; localRoot: string; publicBaseUrl: string; maxUploadBytes: number };
  mail: { transport: 'outbox' | 'disabled'; from: string; outboxDir: string };
}

function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (fallbackForDev !== undefined && process.env.NODE_ENV !== 'production') return fallbackForDev;
  throw new Error(`Missing required environment variable ${name}`);
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const webUrl = required('WEB_URL', 'http://localhost:3000').replace(/\/$/, '');
  const accessSecret = required('JWT_ACCESS_SECRET', isProduction ? undefined : 'dev-only-access-secret-change-me');
  if (isProduction && accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
  }
  const provider = (process.env.PAYMENT_PROVIDER || 'sandbox') as 'paystack' | 'sandbox';
  if (provider !== 'paystack' && provider !== 'sandbox') {
    throw new Error('PAYMENT_PROVIDER must be "paystack" or "sandbox"');
  }
  if (provider === 'sandbox' && isProduction) {
    throw new Error('The sandbox payment provider cannot be used in production');
  }
  if (provider === 'paystack' && !process.env.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack');
  }
  return {
    nodeEnv,
    isProduction,
    port: Number(process.env.API_PORT || 4000),
    apiPrefix: 'api/v1',
    webUrl,
    corsOrigins: (process.env.CORS_ORIGINS || webUrl).split(',').map((o) => o.trim()).filter(Boolean),
    jwt: {
      accessSecret,
      accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS || 900),
      refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 14),
    },
    cookies: {
      secure: (process.env.COOKIE_SECURE || String(isProduction)) === 'true',
      domain: process.env.COOKIE_DOMAIN || undefined,
    },
    payments: {
      provider,
      paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
      paystackBaseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
      callbackUrl: process.env.PAYMENT_CALLBACK_URL || `${webUrl}/checkout/callback`,
    },
    storage: {
      driver: 'local',
      localRoot: process.env.STORAGE_LOCAL_ROOT || 'storage/uploads',
      publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || '/api/v1/media/public',
      maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
    },
    mail: {
      transport: (process.env.MAIL_TRANSPORT || 'outbox') as 'outbox' | 'disabled',
      from: process.env.MAIL_FROM || 'Schutech Academy <no-reply@academy.local>',
      outboxDir: process.env.MAIL_OUTBOX_DIR || 'storage/outbox',
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
