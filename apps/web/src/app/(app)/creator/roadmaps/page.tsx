'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { relative } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, StatusPill } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { Cell, DataTable } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Mine { id: string; title: string; slug: string; status: string; updatedAt: string; reviewNote: string | null; _count: { nodes: number; edges: number } }

export default function MyRoadmaps() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['creator', 'roadmaps'], queryFn: () => get<Mine[]>('/creator/roadmaps') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', summary: '' });
  const create = useMutation({ mutationFn: () => post<{ id: string }>('/creator/roadmaps', f), onSuccess: (r) => router.push(`/creator/roadmaps/${r.id}`) });
  return (
    <div className={a.stack}>
      <PageHead title="Roadmaps" subtitle="Connect courses, topics and milestones into a path. Administrators review roadmaps before they go live." actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New roadmap</Button>} />
      <DataTable
        loading={q.isLoading}
        error={q.error}
        rows={q.data}
        rowKey={(r) => r.id}
        empty="No roadmaps yet"
        columns={[
          { key: 't', header: 'Roadmap', render: (r) => <Link href={`/creator/roadmaps/${r.id}`}><Cell primary={r.title} secondary={r.reviewNote ? `Reviewer: ${r.reviewNote}` : undefined} /></Link> },
          { key: 's', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { key: 'n', header: 'Steps', numeric: true, render: (r) => r._count.nodes },
          { key: 'e', header: 'Links', numeric: true, render: (r) => r._count.edges },
          { key: 'u', header: 'Updated', render: (r) => relative(r.updatedAt) },
        ]}
      />
      <Dialog open={open} onClose={() => setOpen(false)} title="New roadmap" actions={<><Button variant="tertiary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={f.title.trim().length < 3 || f.summary.trim().length < 10} onClick={() => create.mutate()}>Create</Button></>}>
        {create.error && <Callout tone="danger">{errorMessage(create.error)}</Callout>}
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <TextArea label="Summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} hint="At least 10 characters" />
      </Dialog>
    </div>
  );
}
