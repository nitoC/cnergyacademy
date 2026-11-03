import { validateSetting } from './settings.schema';

describe('validateSetting', () => {
  it('rejects unknown keys (no arbitrary configuration writes)', () => {
    expect(validateSetting('payments.secretKey', 'sk_live_x')).toMatchObject({ ok: false });
  });
  it('validates the revenue share range and allows clearing it', () => {
    expect(validateSetting('finance.creatorSharePercent', 120)).toMatchObject({ ok: false });
    expect(validateSetting('finance.creatorSharePercent', 70)).toEqual({ ok: true, value: 70 });
    expect(validateSetting('finance.creatorSharePercent', null)).toEqual({ ok: true, value: null });
  });
  it('type-checks booleans and enums', () => {
    expect(validateSetting('courses.certificatesEnabled', 'yes')).toMatchObject({ ok: false });
    expect(validateSetting('courses.defaultCompletionRule', 'ANYTHING')).toMatchObject({ ok: false });
  });
});
