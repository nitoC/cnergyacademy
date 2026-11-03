// Runs in every integration test worker before modules load.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/academy_test?schema=public';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-tests-0123456789';
process.env.MAIL_TRANSPORT = 'outbox';
process.env.MAIL_OUTBOX_DIR = 'storage/test-outbox';
process.env.STORAGE_LOCAL_ROOT = 'storage/test-uploads';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.WEB_URL = 'http://localhost:3000';
jest.setTimeout(30_000);
process.env.REFRESH_REUSE_GRACE_MS = '0';
