import { AccessFacts, decideModuleAccess } from './access.policy';

const base: AccessFacts = {
  authenticated: true,
  accountActive: true,
  isStaff: false,
  courseStatus: 'PUBLISHED',
  modulePublished: true,
  access: 'FREE',
  isPaidCourse: true,
  hasEntitlement: false,
  prerequisiteQuizId: null,
  prerequisitePassed: false,
  freeRequiresSignIn: true,
};
const decide = (o: Partial<AccessFacts>) => decideModuleAccess({ ...base, ...o });

describe('decideModuleAccess', () => {
  it('grants FREE modules without a purchase', () => {
    expect(decide({ access: 'FREE' }).reason).toBe('ACCESS_GRANTED');
  });

  it('requires purchase for PREMIUM modules', () => {
    const d = decide({ access: 'PREMIUM' });
    expect(d).toMatchObject({ granted: false, reason: 'PURCHASE_REQUIRED', requiresPurchase: true });
    expect(decide({ access: 'PREMIUM', hasEntitlement: true }).granted).toBe(true);
  });

  it('requires passing the prerequisite quiz', () => {
    expect(decide({ access: 'PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1' }).reason).toBe('PREREQUISITE_NOT_COMPLETED');
    expect(decide({ access: 'PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1', prerequisitePassed: true }).granted).toBe(true);
  });

  it('does not let a purchase bypass a prerequisite quiz', () => {
    const d = decide({ access: 'PREMIUM_AND_PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1', hasEntitlement: true });
    expect(d).toMatchObject({ granted: false, reason: 'PREREQUISITE_NOT_COMPLETED', requiresPurchase: false });
  });

  it('does not let passing a quiz grant premium access', () => {
    const d = decide({ access: 'PREMIUM_AND_PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1', prerequisitePassed: true });
    expect(d).toMatchObject({ granted: false, reason: 'PURCHASE_REQUIRED' });
  });

  it('reports both gates when both are missing', () => {
    expect(decide({ access: 'PREMIUM_AND_PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1' }).reason).toBe('PURCHASE_AND_PREREQUISITE_REQUIRED');
  });

  it('treats premium modules of a free course as included', () => {
    expect(decide({ access: 'PREMIUM', isPaidCourse: false }).granted).toBe(true);
  });

  it('blocks unpublished courses and modules for learners', () => {
    expect(decide({ courseStatus: 'APPROVED' }).reason).toBe('COURSE_NOT_PUBLISHED');
    expect(decide({ modulePublished: false }).reason).toBe('MODULE_NOT_PUBLISHED');
  });

  it('lets course staff preview everything, flagged as preview', () => {
    const d = decide({ isStaff: true, courseStatus: 'DRAFT', access: 'PREMIUM_AND_PREREQUISITE_QUIZ', prerequisiteQuizId: 'q1' });
    expect(d).toMatchObject({ granted: true, preview: true });
  });

  it('requires sign-in unless free modules are opened to guests', () => {
    expect(decide({ authenticated: false, accountActive: false }).reason).toBe('AUTHENTICATION_REQUIRED');
    expect(decide({ authenticated: false, accountActive: false, freeRequiresSignIn: false }).granted).toBe(true);
    expect(decide({ authenticated: false, accountActive: false, freeRequiresSignIn: false, access: 'PREMIUM' }).reason).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects inactive accounts', () => {
    expect(decide({ accountActive: false }).reason).toBe('ACCOUNT_NOT_AUTHORIZED');
  });
});
