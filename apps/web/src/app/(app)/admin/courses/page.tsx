'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { get } from '@/lib/api';
import { money, relative } from '@/lib/format';
import { clean, useDebouncedSearch, useListState } from '@/features/administration/useListState';
import type { CourseCard, Paginated, Subject } from '@/types/api';
import { Pill, StatusPill } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

type Row = CourseCard & { status: string; submittedAt: string | null; updatedAt: string; pendingPrice: { id: string; amount: number } | null };

export default function AdminCourses() {
  const { values, page, set } = useListState(['status', 'search', 'subjectId', 'pricing']);
  const [text, setText] = useDebouncedSearch(values.search, (v) => set({ search: v }));
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const q = useQuery({
    queryKey: ['admin', 'courses', values, page],
    queryFn: () => get<Paginated<Row> & { statusCounts: Record<string, number> }>('/admin/courses', { ...clean(values), page }),
    placeholderData: keepPreviousData,
  });
  const counts = q.data?.statusCounts ?? {};
  const tab = values.pricing === 'pending' ? 'pricing' : values.status || 'all';
  return (
    <div className={a.stack}>
      <PageHead title="Courses" subtitle="Review submissions, approve prices and manage publication." />
      <ButtonTabs
        label="Status"
        value={tab}
        onChange={(v) => (v === 'pricing' ? set({ pricing: 'pending', status: '' }) : set({ status: v === 'all' ? '' : v, pricing: '' }))}
        tabs={[
          { value: 'SUBMITTED', label: 'Awaiting review', count: counts.SUBMITTED ?? 0 },
          { value: 'pricing', label: 'Price proposals' },
          { value: 'PUBLISHED', label: 'Published', count: counts.PUBLISHED ?? 0 },
          { value: 'APPROVED', label: 'Approved', count: counts.APPROVED ?? 0 },
          { value: 'DRAFT', label: 'Drafts', count: counts.DRAFT ?? 0 },
          { value: 'REJECTED', label: 'Returned', count: counts.REJECTED ?? 0 },
          { value: 'ARCHIVED', label: 'Archived', count: counts.ARCHIVED ?? 0 },
          { value: 'all', label: 'All' },
        ]}
      />
      <div className={a.toolbar}>
        <div className={a.grow}><TextField label="Search" placeholder="Title or creator" type="search" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <Select label="Subject" value={values.subjectId} onChange={(v) => set({ subjectId: v })} options={[{ value: '', label: 'All subjects' }, ...(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
      </div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        retry={() => q.refetch()}
        rows={q.data?.items}
        rowKey={(c) => c.id}
        empty="No courses here"
        columns={[
          { key: 't', header: 'Course', render: (c) => <Link href={`/admin/courses/${c.id}`}><Cell primary={c.title} secondary={`${c.creator.fullName} · ${c.subject.name}`} /></Link> },
          { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
          { key: 'p', header: 'Price', render: (c) => <Cell primary={money(c.price, c.currency)} secondary={c.pendingPrice ? <Pill tone="amber">proposed {money(c.pendingPrice.amount, c.currency)}</Pill> : undefined} /> },
          { key: 'e', header: 'Learners', numeric: true, render: (c) => c.enrollmentCount },
          { key: 'u', header: values.status === 'SUBMITTED' ? 'Submitted' : 'Updated', render: (c) => relative(values.status === 'SUBMITTED' ? c.submittedAt : c.updatedAt) },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </div>
  );
}
