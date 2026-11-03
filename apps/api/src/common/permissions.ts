/**
 * Permission catalogue and the default role → permission mapping.
 * Roles are additive: a user's effective permissions are the union of
 * the permissions of every role they hold. The mapping is persisted in
 * the database (RolePermission) by the seed; this file is the source the
 * seed reads from.
 */
export const ROLE_KEYS = ['LEARNER', 'CREATOR', 'MENTOR', 'ADMIN'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = {
  // learner
  'profile.manage': 'Manage own profile',
  'courses.learn': 'Enrol in and study courses',
  'support.ask': 'Open support threads',
  'creator.apply': 'Apply to become a creator',
  // creator
  'courses.create': 'Create courses',
  'courses.manage_own': 'Manage own courses, modules, lessons and quizzes',
  'pricing.propose': 'Propose course prices',
  'roadmaps.create': 'Create and edit own roadmaps',
  'media.upload': 'Upload course media',
  // creator + mentor
  'support.respond': 'Respond to learner support threads',
  // administration
  'admin.access': 'Access the administrator workspace',
  'users.read': 'View users',
  'users.manage': 'Change account status',
  'roles.assign': 'Assign roles',
  'creators.review': 'Review creator applications',
  'mentors.manage': 'Manage mentor assignments',
  'courses.review': 'Review and approve courses',
  'courses.manage_any': 'Manage any course',
  'pricing.approve': 'Approve course prices',
  'catalog.manage': 'Manage subjects and categories',
  'roadmaps.publish': 'Review and publish roadmaps',
  'payments.read': 'View payment transactions',
  'payments.manage': 'Reconcile and refund payments',
  'finance.read': 'View revenue, ledger and exports',
  'reports.read': 'View learner reports',
  'support.oversee': 'Oversee all support threads',
  'certificates.manage': 'Revoke certificates',
  'settings.manage': 'Change platform settings',
  'audit.read': 'Read audit logs',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const LEARNER: PermissionKey[] = ['profile.manage', 'courses.learn', 'support.ask', 'creator.apply'];
const CREATOR: PermissionKey[] = [
  'courses.create',
  'courses.manage_own',
  'pricing.propose',
  'roadmaps.create',
  'media.upload',
  'support.respond',
];
const MENTOR: PermissionKey[] = ['support.respond'];
const ADMIN = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = { LEARNER, CREATOR, MENTOR, ADMIN };

export const ROLE_DESCRIPTIONS: Record<RoleKey, { name: string; description: string }> = {
  LEARNER: { name: 'Learner', description: 'Studies courses and roadmaps' },
  CREATOR: { name: 'Creator', description: 'Authors courses (granted after application approval)' },
  MENTOR: { name: 'Mentor', description: 'Answers learner questions on assigned courses' },
  ADMIN: { name: 'Administrator', description: 'Operates the platform' },
};
