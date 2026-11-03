'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { X } from 'lucide-react';
import { del, errorMessage, get, post } from '@/lib/api';
import type { CourseCard, Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Mentor { id: string; fullName: string; email: string; status: string; mentorAssignments: { id: string; course: { id: string; title: string } }[]; _count: { mentoredThreads: number; supportMessages: number } }

export default function MentorsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const mentors = useQuery({ queryKey: ['admin', 'mentors'], queryFn: () => get<Paginated<Mentor>>('/admin/mentors', { pageSize: 100 }) });
  const courses = useQuery({ queryKey: ['catalog', 'all'], queryFn: () => get<Paginated<CourseCard>>('/courses', { pageSize: 100, sort: 'title' }) });
  const [f, setF] = useState({ mentorId: '', courseId: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'mentors'] });
  const assign = useMutation({ mutationFn: () => post('/admin/mentor-assignments', f), onSuccess: () => { toast('Mentor assigned'); setF({ mentorId: '', courseId: '' }); refresh(); } });
  const unassign = useMutation({ mutationFn: (id: string) => del(`/admin/mentor-assignments/${id}`), onSuccess: () => { toast('Assignment removed; open questions returned to the creator'); refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });
  return (
    <div className={a.stack}>
      <PageHead title="Mentors" subtitle="Grant the mentor role from a user's profile, then assign them to courses here." actions={<Link className={a.link} href="/admin/support">Support oversight</Link>} />
      <div className={a.split}>
        <DataTable
          loading={mentors.isLoading}
          error={mentors.error}
          rows={mentors.data?.items}
          rowKey={(m) => m.id}
          empty="No users hold the mentor role yet"
          columns={[
            { key: 'n', header: 'Mentor', render: (m) => <Link href={`/admin/users/${m.id}`}><Cell primary={m.fullName} secondary={m.email} /></Link> },
            { key: 's', header: 'Status', render: (m) => <StatusPill status={m.status} /> },
            { key: 'c', header: 'Courses', render: (m) => m.mentorAssignments.length ? m.mentorAssignments.map((x) => <div key={x.id} className={a.row} style={{ gap: 4, fontSize: '0.85rem' }}>{x.course.title}<Button size="sm" variant="tertiary" aria-label={`Remove from ${x.course.title}`} onClick={() => unassign.mutate(x.id)}><X size={12} /></Button></div>) : <span className={a.muted}>Unassigned</span> },
            { key: 'o', header: 'Open threads', numeric: true, render: (m) => m._count.mentoredThreads },
            { key: 'r', header: 'Replies', numeric: true, render: (m) => m._count.supportMessages },
          ]}
        />
        <Panel>
          <h2 className={a.sectionTitle}>Assign to a course</h2>
          <div className={a.stackSm}>
            {assign.error && <Callout tone="danger">{errorMessage(assign.error)}</Callout>}
            <Select label="Mentor" value={f.mentorId} onChange={(v) => setF({ ...f, mentorId: v })} options={(mentors.data?.items ?? []).map((m) => ({ value: m.id, label: m.fullName }))} />
            <Select label="Course" value={f.courseId} onChange={(v) => setF({ ...f, courseId: v })} options={(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))} />
            <Button variant="primary" loading={assign.isPending} disabled={!f.mentorId || !f.courseId} onClick={() => assign.mutate()}>Assign</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
