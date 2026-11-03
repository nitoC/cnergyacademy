'use client';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { get } from '@/lib/api';
import { ButtonLink } from '@/components/ui/Button';
import s from './nav.module.scss';

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 45_000,
  });
  const n = data?.unread ?? 0;
  return (
    <span className={s.bell}>
      <ButtonLink href="/notifications" variant="tertiary" size="sm" aria-label={n ? `Notifications, ${n} unread` : 'Notifications'}>
        <Bell size={18} />
      </ButtonLink>
      {n > 0 && <span className={s.bellDot} aria-hidden>{n > 99 ? '99+' : n}</span>}
    </span>
  );
}
