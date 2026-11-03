'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ApiError, get, post } from '@/lib/api';
import type { Me } from '@/types/api';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';

export const ME_KEY = ['me'] as const;

/** Current user, or null when signed out. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      // No session hint cookie → definitely signed out; skip the round trip.
      if (typeof document !== 'undefined' && !document.cookie.includes('academy_session=')) return null;
      try {
        return await get<Me>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useCan() {
  const { data } = useMe();
  return (permission: string) => !!data?.permissions.includes(permission);
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.push('/');
    router.refresh();
  };
}

/**
 * Client-side gate for role workspaces. This only shapes the UI; every API
 * call made from inside is authorised again by the server.
 */
export function RequireAuth({ permission, children }: { permission?: string; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isLoading && me === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, me, router, pathname]);
  if (isLoading || me === undefined || me === null) return <LoadingBlock rows={5} />;
  if (permission && !me.permissions.includes(permission)) {
    return (
      <EmptyState title="This area is not part of your workspace" action={<ButtonLink href="/learn">Go to my learning</ButtonLink>}>
        Your account does not have access here. If you think it should, contact an administrator.
      </EmptyState>
    );
  }
  return <>{children}</>;
}
