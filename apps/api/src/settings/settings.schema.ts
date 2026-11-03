/**
 * Whitelisted platform settings. Only keys listed here can be read or
 * written, and every value is validated against its declared type. Secrets
 * (payment keys, JWT secrets) are environment-only and never stored here.
 */
type SettingDef =
  | { type: 'string'; default: string; group: string; label: string; maxLength?: number }
  | { type: 'text'; default: string; group: string; label: string }
  | { type: 'boolean'; default: boolean; group: string; label: string }
  | { type: 'percent-or-null'; default: number | null; group: string; label: string; help?: string }
  | { type: 'enum'; default: string; options: string[]; group: string; label: string };

export const SETTINGS_SCHEMA = {
  'general.platformName': { type: 'string', default: 'Cnergy Academy', group: 'General', label: 'Platform name', maxLength: 80 },
  'general.supportEmail': { type: 'string', default: 'support@academy.local', group: 'General', label: 'Support email', maxLength: 120 },
  'finance.creatorSharePercent': {
    type: 'percent-or-null',
    default: null,
    group: 'Payments',
    label: 'Creator revenue share (%)',
    help: 'Leave empty until the revenue model is agreed. While empty, sales are recorded gross and no earnings are allocated.',
  },
  'payments.requireVerifiedEmail': { type: 'boolean', default: true, group: 'Payments', label: 'Require a verified email before purchase' },
  'courses.defaultCompletionRule': {
    type: 'enum',
    default: 'ALL_LESSONS_AND_QUIZZES',
    options: ['ALL_LESSONS', 'ALL_LESSONS_AND_QUIZZES'],
    group: 'Courses',
    label: 'Default completion rule for new courses',
  },
  'courses.certificatesEnabled': { type: 'boolean', default: true, group: 'Courses', label: 'Issue certificates on completion' },
  'notifications.emailEnabled': { type: 'boolean', default: false, group: 'Notifications', label: 'Send notification emails (requires a mail provider)' },
  'notifications.courseActivity': { type: 'boolean', default: true, group: 'Notifications', label: 'Notify enrolled learners when new lessons are published' },
  'policies.refundPolicy': { type: 'text', default: 'Refunds are reviewed within 7 days of purchase.', group: 'Policies', label: 'Refund policy' },
  'policies.codeOfConduct': { type: 'text', default: 'Be respectful in support conversations.', group: 'Policies', label: 'Code of conduct' },
  'access.freeModulesRequireSignIn': { type: 'boolean', default: true, group: 'Access', label: 'Free modules require a signed-in learner' },
} satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

export function validateSetting(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const def = (SETTINGS_SCHEMA as Record<string, SettingDef>)[key];
  if (!def) return { ok: false, error: `Unknown setting ${key}` };
  switch (def.type) {
    case 'string':
      if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${def.label} must be text` };
      if (def.maxLength && value.length > def.maxLength) return { ok: false, error: `${def.label} is too long` };
      return { ok: true, value: value.trim() };
    case 'text':
      if (typeof value !== 'string' || value.length > 5000) return { ok: false, error: `${def.label} must be text under 5000 characters` };
      return { ok: true, value };
    case 'boolean':
      if (typeof value !== 'boolean') return { ok: false, error: `${def.label} must be true or false` };
      return { ok: true, value };
    case 'percent-or-null':
      if (value === null || value === '') return { ok: true, value: null };
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)
        return { ok: false, error: `${def.label} must be between 0 and 100` };
      return { ok: true, value: Math.round(value * 100) / 100 };
    case 'enum':
      if (typeof value !== 'string' || !def.options.includes(value)) return { ok: false, error: `${def.label} is invalid` };
      return { ok: true, value };
  }
}
