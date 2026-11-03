'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { date } from '@/lib/format';
import { useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea } from '@/components/ui/Field';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface App { id: string; headline: string; expertise: string; portfolioUrl: string | null; motivation: string; status: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null; user: { id: string; fullName: string; email: string }; reviewer: { fullName: string } | null }
interface Creator { id: string; fullName: string; email: string; status: string; courses: { id: string; title: string; status: string; _count: { enrollments: number } }[] }

export default function CreatorsPage() {
  const { values, page, set } = useListState(['view', 'status']);
  const view = (values.view || 'applications') as 'applications' | 'creators';
  const status = values.status || 'PENDING';
  const qc = useQueryClient();
  const toast = useToast();
  const [review, setReview] = useState<{ app: App; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const apps = useQuery({ queryKey: ['admin', 'applications', status, page], queryFn: () => get<Paginated<App>>('/admin/creator-applications', { status: status === 'ALL' ? undefined : status, page }), enabled: view === 'applications', placeholderData: keepPreviousData });
  const creators = useQuery({ queryKey: ['admin', 'creators', page], queryFn: () => get<Paginated<Creator>>('/admin/creators', { page }), enabled: view === 'creators' });
  const decide = useMutation({
    mutationFn: () => post(`/admin/creator-applications/${review!.app.id}/review`, { decision: review!.decision, note: note || undefined }),
    onSuccess: () => { toast(review!.decision === 'APPROVED' ? 'Creator approved — role granted' : 'Application declined'); setReview(null); setNote(''); qc.invalidateQueries({ queryKey: ['admin'] }); },
  });

  return (
    <div className={a.stack}>
      <PageHead title="Creators" subtitle="Approving an application grants the creator role. Every decision is audited." />
      <ButtonTabs label="View" value={view} onChange={(v) => set({ view: v })} tabs={[{ value: 'applications', label: 'Applications' }, { value: 'creators', label: 'Approved creators' }]} />
      {view === 'applications' ? (
        <>
          <ButtonTabs label="Status" value={status} onChange={(v) => set({ status: v })} tabs={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Declined' }, { value: 'ALL', label: 'All' }]} />
          <DataTable
            loading={apps.isLoading}
            error={apps.error}
            rows={apps.data?.items}
            rowKey={(x) => x.id}
            empty="No applications here"
            columns={[
              { key: 'u', header: 'Applicant', render: (x) => <Link href={`/admin/users/${x.user.id}`}><Cell primary={x.user.fullName} secondary={x.user.email} /></Link> },
              { key: 'h', header: 'Application', render: (x) => <Cell primary={x.headline} secondary={<>{x.expertise.slice(0, 140)}{x.portfolioUrl && <> · <a className={a.link} href={x.portfolioUrl} target="_blank" rel="noopener noreferrer">portfolio</a></>}</>} /> },
              { key: 'd', header: 'Submitted', render: (x) => date(x.createdAt) },
              { key: 's', header: 'Status', render: (x) => <Cell primary={<StatusPill status={x.status} />} secondary={x.reviewer ? `by ${x.reviewer.fullName}` : undefined} /> },
              {
                key: 'act', header: '', render: (x) => x.status === 'PENDING' ? (
                  <span className={a.row} style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" variant="primary" onClick={() => setReview({ app: x, decision: 'APPROVED' })}>Approve</Button>
                    <Button size="sm" onClick={() => setReview({ app: x, decision: 'REJECTED' })}>Decline</Button>
                  </span>
                ) : null,
              },
            ]}
          />
          {apps.data && <Pagination page={apps.data.page} totalPages={apps.data.totalPages} total={apps.data.total} onPage={(p) => set({ page: p })} />}
        </>
      ) : (
        <DataTable
          loading={creators.isLoading}
          error={creators.error}
          rows={creators.data?.items}
          rowKey={(c) => c.id}
          columns={[
            { key: 'n', header: 'Creator', render: (c) => <Link href={`/admin/users/${c.id}`}><Cell primary={c.fullName} secondary={c.email} /></Link> },
            { key: 's', header: 'Account', render: (c) => <StatusPill status={c.status} /> },
            { key: 'c', header: 'Courses', render: (c) => (c.courses.length ? c.courses.map((x) => <div key={x.id} style={{ fontSize: '0.85rem' }}><Link href={`/admin/courses/${x.id}`}>{x.title}</Link> <span className={a.muted}>· {x.status.toLowerCase()} · {x._count.enrollments} learners</span></div>) : <span className={a.muted}>None yet</span>) },
          ]}
        />
      )}
      <Dialog open={!!review} onClose={() => setReview(null)} title={review?.decision === 'APPROVED' ? `Approve ${review?.app.user.fullName}?` : `Decline ${review?.app.user.fullName}?`} actions={<><Button variant="tertiary" onClick={() => setReview(null)}>Cancel</Button><Button variant={review?.decision === 'APPROVED' ? 'primary' : 'danger'} loading={decide.isPending} disabled={review?.decision === 'REJECTED' && !note.trim()} onClick={() => decide.mutate()}>{review?.decision === 'APPROVED' ? 'Approve and grant role' : 'Decline'}</Button></>}>
        {review && <p style={{ fontSize: '0.9rem' }}>{review.app.motivation}</p>}
        {decide.error && <Callout tone="danger">{errorMessage(decide.error)}</Callout>}
        <TextArea label={review?.decision === 'REJECTED' ? 'Reason (sent to the applicant)' : 'Note to the applicant (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </div>
  );
}
