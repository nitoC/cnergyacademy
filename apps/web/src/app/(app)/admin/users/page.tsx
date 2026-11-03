'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { get } from '@/lib/api';
import { date, relative } from '@/lib/format';
import { clean, useDebouncedSearch, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { Pill, StatusPill } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface UserRow { id: string; email: string; fullName: string; status: string; emailVerifiedAt: string | null; lastActiveAt: string | null; createdAt: string; roles: string[]; _count: { enrollments: number; courses: number } }

export default function UsersPage() {
  const { values, page, set } = useListState(['search', 'role', 'status']);
  const [text, setText] = useDebouncedSearch(values.search, (v) => set({ search: v }));
  const q = useQuery({ queryKey: ['admin', 'users', values, page], queryFn: () => get<Paginated<UserRow>>('/admin/users', { ...clean(values), page }), placeholderData: keepPreviousData });
  return (
    <div className={a.stack}>
      <PageHead title="Users" />
      <div className={a.toolbar}>
        <div className={a.grow}><TextField label="Search" placeholder="Name or email" value={text} onChange={(e) => setText(e.target.value)} type="search" /></div>
        <Select label="Role" value={values.role} onChange={(v) => set({ role: v })} options={[{ value: '', label: 'Any role' }, { value: 'LEARNER', label: 'Learner' }, { value: 'CREATOR', label: 'Creator' }, { value: 'MENTOR', label: 'Mentor' }, { value: 'ADMIN', label: 'Administrator' }]} />
        <Select label="Status" value={values.status} onChange={(v) => set({ status: v })} options={[{ value: '', label: 'Any status' }, { value: 'ACTIVE', label: 'Active' }, { value: 'PENDING_VERIFICATION', label: 'Unverified' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'DEACTIVATED', label: 'Deactivated' }]} />
      </div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        retry={() => q.refetch()}
        rows={q.data?.items}
        rowKey={(u) => u.id}
        empty="No users match"
        columns={[
          { key: 'n', header: 'User', render: (u) => <Link href={`/admin/users/${u.id}`}><Cell primary={u.fullName} secondary={u.email} /></Link> },
          { key: 'r', header: 'Roles', render: (u) => <span className={a.row} style={{ gap: 4 }}>{u.roles.filter((r) => r !== 'LEARNER').map((r) => <Pill key={r} tone={r === 'ADMIN' ? 'terracotta' : r === 'CREATOR' ? 'amber' : 'slate'}>{r.toLowerCase()}</Pill>)}{u.roles.length === 1 && <span className={a.muted}>learner</span>}</span> },
          { key: 's', header: 'Status', render: (u) => <StatusPill status={u.status} /> },
          { key: 'e', header: 'Enrolments', numeric: true, render: (u) => u._count.enrollments },
          { key: 'a', header: 'Last active', render: (u) => relative(u.lastActiveAt) },
          { key: 'j', header: 'Joined', render: (u) => date(u.createdAt) },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </div>
  );
}
