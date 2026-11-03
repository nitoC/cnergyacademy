'use client';
import { Suspense } from 'react';
import { RequireAuth } from '@/features/auth/session';
import { LoadingBlock } from '@/components/ui/Feedback';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth permission="admin.access">
      <Suspense fallback={<LoadingBlock />}>{children}</Suspense>
    </RequireAuth>
  );
}
