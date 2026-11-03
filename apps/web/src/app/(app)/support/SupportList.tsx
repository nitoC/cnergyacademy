'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { get } from '@/lib/api';
import { relative } from '@/lib/format';
import { useCan } from '@/features/auth/session';
import type { Paginated } from '@/types/api';
import { StatusPill } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../PageHead';
import a from '../app.module.scss';

export interface ThreadRow {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  unread: boolean;
  course: { id: string; title: string };
  lesson: { id: string; title: string } | null;
  learner: { id: string; fullName: string };
  mentor: { id: string; fullName: string } | null;
  lastMessage: { body: string } | null;
}

export function SupportList({ scopeOverride, title }: { scopeOverride?: 'all'; title?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const scope = scopeOverride ?? ((params.get('scope') as 'mine' | 'inbox') || 'mine');
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'page') n.delete('page');
    router.replace(`${pathname}?${n}`);
  };
  const q = useQuery({
    queryKey: ['threads', scope, status, page],
    queryFn: () => get<Paginated<ThreadRow>>('/support-threads', { scope, status: status || undefined, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  return (
    <div className={a.stack}>
      <PageHead title={title ?? (scope === 'inbox' ? 'Learner questions' : 'My questions')} subtitle={scope === 'inbox' ? 'Questions from learners on courses you create or mentor.' : 'Ask from any lesson; replies arrive here and in your notifications.'} />
      {!scopeOverride && can('support.respond') && (
        <ButtonTabs label="Inbox" value={scope} onChange={(v) => set('scope', v === 'mine' ? '' : v)} tabs={[{ value: 'mine', label: 'Asked by me' }, { value: 'inbox', label: 'To answer' }]} />
      )}
      <div className={a.toolbar}>
        <Select
          label="Status"
          value={status}
          onChange={(v) => set('status', v)}
          options={[{ value: '', label: 'All statuses' }, { value: 'WAITING_FOR_RESPONSE', label: 'Waiting for response' }, { value: 'ANSWERED', label: 'Answered' }, { value: 'OPEN', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }]}
        />
      </div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        retry={() => q.refetch()}
        rows={q.data?.items}
        rowKey={(t) => t.id}
        empty="No conversations"
        columns={[
          {
            key: 'subject',
            header: 'Conversation',
            render: (t) => (
              <Link href={`/support/${t.id}`}>
                <Cell primary={<>{t.unread && <span aria-label="unread" style={{ color: 'var(--amber-300)' }}>● </span>}{t.subject}</>} secondary={t.lastMessage?.body} />
              </Link>
            ),
          },
          { key: 'course', header: 'Course', render: (t) => <Cell primary={t.course.title} secondary={t.lesson?.title} /> },
          { key: 'who', header: scope === 'mine' ? 'Mentor' : 'Learner', render: (t) => (scope === 'mine' ? t.mentor?.fullName ?? 'Course creator' : t.learner.fullName) },
          { key: 'status', header: 'Status', render: (t) => <StatusPill status={t.status} /> },
          { key: 'last', header: 'Last message', render: (t) => relative(t.lastMessageAt) },
        ]}
      />
      {q.data && q.data.totalPages > 1 && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set('page', String(p))} />}
    </div>
  );
}
