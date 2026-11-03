'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { get, post } from '@/lib/api';
import { relative } from '@/lib/format';
import type { Notification, Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../PageHead';
import a from '../app.module.scss';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [unread, setUnread] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['notifications', unread, page],
    queryFn: () => get<Paginated<Notification> & { unread: number }>('/notifications', { unread: unread === 'unread' || undefined, page }),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readOne = useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: invalidate });

  return (
    <div className={a.stack} style={{ maxWidth: 820 }}>
      <PageHead title="Notifications" actions={<Button size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending} disabled={!q.data?.unread}>Mark all as read</Button>} />
      <ButtonTabs label="Filter" value={unread} onChange={(v) => { setUnread(v); setPage(1); }} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: q.data?.unread }]} />
      {q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingBlock />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="You are all caught up" />
      ) : (
        <ul className={a.queue}>
          {q.data.items.map((n) => (
            <li key={n.id} className={a.queueItem} style={{ opacity: n.readAt ? 0.65 : 1 }}>
              <div>
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.readAt && readOne.mutate(n.id)} style={{ color: 'var(--ink-0)', fontWeight: n.readAt ? 400 : 600 }}>
                    {n.title}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--ink-0)' }}>{n.title}</span>
                )}
                {n.body && <div className={a.muted}>{n.body}</div>}
              </div>
              <span className={a.row}>
                <span className={a.muted}>{relative(n.createdAt)}</span>
                {!n.readAt && <Button size="sm" variant="tertiary" onClick={() => readOne.mutate(n.id)}>Mark read</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.data && q.data.totalPages > 1 && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />}
    </div>
  );
}
