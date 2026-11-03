'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { get } from '@/lib/api';
import { money, relative } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface MyCourse { id: string; title: string; slug: string; status: string; price: number; currency: string; updatedAt: string; pendingPrice: number | null; enrollmentCount: number; moduleCount: number; lastReview: { decision: string; feedback: string | null } | null }

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'SUBMITTED', label: 'In review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'REJECTED', label: 'Changes requested' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export default function MyCourses() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('all');
  const q = useQuery({ queryKey: ['creator', 'courses'], queryFn: () => get<MyCourse[]>('/creator/courses') });
  const rows = q.data?.filter((c) => tab === 'all' || c.status === tab);
  return (
    <div className={a.stack}>
      <PageHead title="Courses" actions={<ButtonLink href="/creator/courses/new" variant="primary" icon={<Plus size={16} />}>New course</ButtonLink>} />
      <ButtonTabs label="Status" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.value === 'all' ? q.data?.length : q.data?.filter((c) => c.status === t.value).length }))} />
      <DataTable
        loading={q.isLoading}
        error={q.error}
        retry={() => q.refetch()}
        rows={rows}
        rowKey={(c) => c.id}
        empty="No courses in this state"
        columns={[
          { key: 't', header: 'Course', render: (c) => <Link href={`/creator/courses/${c.id}`}><Cell primary={c.title} secondary={c.lastReview?.decision === 'REJECTED' ? `Feedback: ${c.lastReview.feedback}` : `${c.moduleCount} modules`} /></Link> },
          { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
          { key: 'p', header: 'Price', render: (c) => <Cell primary={money(c.price, c.currency)} secondary={c.pendingPrice !== null ? `Proposed ${money(c.pendingPrice, c.currency)} (pending)` : undefined} /> },
          { key: 'e', header: 'Learners', numeric: true, render: (c) => c.enrollmentCount },
          { key: 'u', header: 'Updated', render: (c) => relative(c.updatedAt) },
        ]}
      />
    </div>
  );
}
