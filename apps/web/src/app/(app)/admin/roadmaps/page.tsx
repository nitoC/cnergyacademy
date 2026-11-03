'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { relative } from '@/lib/format';
import { clean, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Row { id: string; title: string; slug: string; status: string; updatedAt: string; owner: { fullName: string }; course: { id: string; title: string; status: string } | null; _count: { nodes: number; edges: number } }

export default function AdminRoadmaps() {
  const { values, page, set } = useListState(['status', 'kind']);
  const q = useQuery({ queryKey: ['admin', 'roadmaps', values, page], queryFn: () => get<Paginated<Row>>('/admin/roadmaps', { ...clean(values), kind: values.kind || 'platform', page }), placeholderData: keepPreviousData });
  return (
    <div className={a.stack}>
      <PageHead title="Roadmaps" subtitle="Review creator roadmaps and publish platform roadmaps." actions={<ButtonLink href="/creator/roadmaps" variant="primary" icon={<Plus size={15} />}>Create a roadmap</ButtonLink>} />
      <ButtonTabs
        label="Kind"
        value={values.kind || 'platform'}
        onChange={(v) => set({ kind: v, status: '' })}
        tabs={[{ value: 'platform', label: 'Learning paths' }, { value: 'course', label: 'Course roadmaps' }]}
      />
      {(values.kind || 'platform') === 'platform' ? (
        <ButtonTabs label="Status" value={values.status || 'all'} onChange={(v) => set({ status: v === 'all' ? '' : v })} tabs={[{ value: 'SUBMITTED', label: 'Submitted' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'ARCHIVED', label: 'Archived' }, { value: 'all', label: 'All' }]} />
      ) : (
        <p className={a.muted}>Course roadmaps are written by each course’s creator and reviewed as part of the course.</p>
      )}
      <DataTable
        loading={q.isLoading}
        error={q.error}
        rows={q.data?.items}
        rowKey={(r) => r.id}
        empty="No roadmaps here"
        columns={[
          {
            key: 't',
            header: 'Roadmap',
            render: (r) => (
              <Link href={r.course ? `/admin/courses/${r.course.id}` : `/creator/roadmaps/${r.id}`}>
                <Cell primary={r.course ? r.course.title : r.title} secondary={`by ${r.owner.fullName}`} />
              </Link>
            ),
          },
          { key: 's', header: 'Status', render: (r) => <StatusPill status={r.course ? r.course.status : r.status} /> },
          { key: 'n', header: 'Steps', numeric: true, render: (r) => r._count.nodes },
          { key: 'e', header: 'Prerequisites', numeric: true, render: (r) => r._count.edges },
          { key: 'u', header: 'Updated', render: (r) => relative(r.updatedAt) },
          { key: 'v', header: '', render: (r) => <Link className={a.link} href={`/roadmaps/${r.slug}`}>Preview</Link> },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </div>
  );
}
