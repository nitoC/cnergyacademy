'use client';
import { RequireAuth } from '@/features/auth/session';

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth permission="courses.create">{children}</RequireAuth>;
}
