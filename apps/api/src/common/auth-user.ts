import type { AccountStatus } from '@prisma/client';
import type { PermissionKey, RoleKey } from './permissions';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  status: AccountStatus;
  emailVerified: boolean;
  roles: RoleKey[];
  permissions: Set<PermissionKey>;
}

export function can(user: AuthUser | undefined | null, permission: PermissionKey): boolean {
  return !!user && user.permissions.has(permission);
}
