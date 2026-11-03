'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { clean, useDebouncedSearch, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { StatusPill } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Entry { id: string; action: string; resourceType: string; resourceId: string | null; outcome: string; metadata: Record<string, unknown>; ipAddress: string | null; createdAt: string; actor: { fullName: string; email: string } | null }

const ACTIONS = ['user.', 'creator.', 'course.', 'pricing.', 'payment.', 'certificate.', 'settings.', 'roadmap.', 'auth.', 'mentor.', 'support.'];

export default function AuditLogs() {
  const { values, page, set } = useListState(['action', 'resourceType', 'search']);
  const [text, setText] = useDebouncedSearch(values.search, (v) => set({ search: v }));
  const q = useQuery({ queryKey: ['admin', 'audit', values, page], queryFn: () => get<Paginated<Entry>>('/admin/audit-logs', { ...clean(values), page, pageSize: 50 }), placeholderData: keepPreviousData });
  return (
    <div className={a.stack}>
      <PageHead title="Audit log" subtitle="Append-only record of sensitive actions. Entries cannot be edited or deleted." />
      <div className={a.toolbar}>
        <Select label="Area" value={values.action} onChange={(v) => set({ action: v })} options={[{ value: '', label: 'All actions' }, ...ACTIONS.map((x) => ({ value: x, label: x.replace('.', '') }))]} />
        <div className={a.grow}><TextField label="Search" placeholder="Action or resource id" type="search" value={text} onChange={(e) => setText(e.target.value)} /></div>
      </div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        rows={q.data?.items}
        rowKey={(e) => e.id}
        empty="No entries"
        columns={[
          { key: 't', header: 'When', render: (e) => <span className={a.mono}>{dateTime(e.createdAt)}</span> },
          { key: 'a', header: 'Actor', render: (e) => (e.actor ? <Cell primary={e.actor.fullName} secondary={e.ipAddress ?? undefined} /> : <span className={a.muted}>system</span>) },
          { key: 'x', header: 'Action', render: (e) => <span className={a.mono}>{e.action}</span> },
          { key: 'r', header: 'Resource', render: (e) => <Cell primary={e.resourceType} secondary={e.resourceId ?? undefined} /> },
          { key: 'o', header: 'Outcome', render: (e) => <StatusPill status={e.outcome} /> },
          { key: 'm', header: 'Details', render: (e) => <code style={{ fontSize: '0.72rem', color: 'var(--ink-2)', display: 'block', maxWidth: 320, overflowWrap: 'anywhere' }}>{JSON.stringify(e.metadata)}</code> },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </div>
  );
}
