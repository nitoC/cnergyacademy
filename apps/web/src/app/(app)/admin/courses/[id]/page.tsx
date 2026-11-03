'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { ACCESS_LABEL, DIFFICULTY_LABEL, date, dateTime, duration, money } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Panel, Pill, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea } from '@/components/ui/Field';
import type { EditorCourse } from '../../../creator/courses/[id]/types';
import { RoadmapBoard } from '@/features/roadmaps/RoadmapBoard';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';

type Action = 'approve' | 'reject' | 'publish' | 'unpublish' | 'archive' | 'restore';
const ACTION_COPY: Record<Action, { label: string; needsNote: boolean; variant: 'primary' | 'danger' | 'secondary' }> = {
  approve: { label: 'Approve', needsNote: false, variant: 'primary' },
  reject: { label: 'Request changes', needsNote: true, variant: 'danger' },
  publish: { label: 'Publish', needsNote: false, variant: 'primary' },
  unpublish: { label: 'Unpublish', needsNote: false, variant: 'secondary' },
  archive: { label: 'Archive', needsNote: false, variant: 'danger' },
  restore: { label: 'Restore to draft', needsNote: false, variant: 'secondary' },
};

export default function AdminCourseReview() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const q = useQuery({ queryKey: ['admin', 'course', id], queryFn: () => get<EditorCourse>(`/admin/courses/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const act = useMutation({
    mutationFn: (action: Action) => post(`/courses/${id}/transitions`, { action, feedback: note || undefined }),
    onSuccess: (_, action) => { toast(`${ACTION_COPY[action].label} — done`); setPending(null); setNote(''); refresh(); },
  });
  const decidePrice = useMutation({
    mutationFn: ({ proposalId, decision }: { proposalId: string; decision: 'APPROVED' | 'REJECTED' }) => post(`/admin/price-proposals/${proposalId}/decision`, { decision, note: priceNote || undefined }),
    onSuccess: () => { toast('Price decision recorded'); setPriceNote(''); refresh(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const c = q.data;
  const ownCourse = me?.id === c.creator.id;
  const available: Action[] = (
    {
      SUBMITTED: ['approve', 'reject'],
      APPROVED: ['publish', 'archive'],
      PUBLISHED: ['unpublish', 'archive'],
      DRAFT: ['archive'],
      REJECTED: ['archive'],
      ARCHIVED: ['restore'],
    } as Record<string, Action[]>
  )[c.status] ?? [];
  const proposal = c.priceProposals.find((p) => p.status === 'PENDING');
  const totalLessons = c.modules.reduce((s, m) => s + m.lessons.length, 0);

  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: '/admin/courses', label: 'Courses' }]}
        title={c.title}
        subtitle={<span className={a.row}><StatusPill status={c.status} /> by {c.creator.fullName} ({c.creator.email})</span>}
        actions={<ButtonLink href={`/learn/courses/${c.id}`} icon={<Eye size={15} />}>Open as reviewer</ButtonLink>}
      />
      {ownCourse && (c.status === 'SUBMITTED') && <Callout>You authored this course, so another administrator must review it.</Callout>}
      <div className={a.split}>
        <div className={a.stack}>
          <Panel>
            <p style={{ marginBottom: 14 }}>{c.shortDescription}</p>
            <dl className={a.dl}>
              <dt>Subject</dt><dd>{c.subject.name}</dd>
              <dt>Level · length</dt><dd>{DIFFICULTY_LABEL[c.difficulty]} · {duration(c.estimatedMinutes)}</dd>
              <dt>Structure</dt><dd>{c.modules.length} modules · {totalLessons} lessons · {c.quizzes.length} quizzes</dd>
              <dt>Completion</dt><dd>{c.completionRule === 'ALL_LESSONS' ? 'All lessons' : 'All lessons and quizzes'}{c.certificateEnabled ? ' · certificate' : ''}</dd>
              <dt>Outcomes</dt><dd>{c.learningOutcomes.join(' · ') || '—'}</dd>
            </dl>
            <p style={{ marginTop: 14, whiteSpace: 'pre-line', color: 'var(--ink-2)', fontSize: '0.9rem' }}>{c.description}</p>
          </Panel>
          <section>
            <h2 className={a.sectionTitle}>Roadmap</h2>
            {c.roadmap && c.roadmap.nodes.length > 0 ? (
              <RoadmapBoard path={`/courses/${c.id}/roadmap`} showProgress={false} />
            ) : (
              <p className={a.muted}>The creator has not built this course’s roadmap yet. It is required before submission.</p>
            )}
          </section>
          <section>
            <h2 className={a.sectionTitle}>Curriculum</h2>
            <ol className={a.queue} style={{ listStyle: 'none' }}>
              {c.modules.map((m) => (
                <li key={m.id} className={a.queueItem} style={{ alignItems: 'start' }}>
                  <div>
                    <strong style={{ color: 'var(--ink-0)' }}>{m.position}. {m.title}</strong> {!m.isPublished && <Pill>hidden</Pill>}
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.86rem' }}>
                      {m.lessons.map((l) => <li key={l.id}><Link className={a.link} href={`/learn/lessons/${l.id}`}>{l.title}</Link>{!l.isPublished && ' (draft)'}</li>)}
                      {m.quizzes.map((z) => <li key={z.id} style={{ color: 'var(--amber-300)' }}>Quiz: {z.title} ({z._count.questions} questions{z.isPublished ? '' : ', draft'})</li>)}
                    </ul>
                  </div>
                  <span style={{ textAlign: 'right' }}>
                    <Pill tone={m.access === 'FREE' ? 'forest' : m.access.startsWith('PREMIUM') ? 'terracotta' : 'amber'}>{ACCESS_LABEL[m.access]}</Pill>
                    {m.prerequisiteQuiz && <div className={a.muted}>gate: {m.prerequisiteQuiz.title}</div>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className={a.stack}>
          <Panel>
            <h2 className={a.sectionTitle}>Decision</h2>
            {c.readiness.issues.length > 0 && (
              <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', fontSize: '0.85rem' }}>
                {c.readiness.issues.map((i) => <li key={i}><X size={12} color="var(--terracotta-300)" /> {i}</li>)}
              </ul>
            )}
            {c.readiness.needsApprovedPrice && <div style={{ marginBottom: 12 }}><Callout>Premium modules need an approved price before publishing.</Callout></div>}
            <div className={a.row}>
              {available.map((x) => (
                <Button key={x} variant={ACTION_COPY[x].variant} disabled={ownCourse && (x === 'approve' || x === 'reject')} onClick={() => { setNote(''); setPending(x); }}>{ACTION_COPY[x].label}</Button>
              ))}
            </div>
          </Panel>
          <Panel>
            <h2 className={a.sectionTitle}>Pricing</h2>
            <dl className={a.dl} style={{ gridTemplateColumns: '110px 1fr' }}>
              <dt>Approved</dt><dd>{c.approvedPrice ? money(c.approvedPrice, c.currency) : 'Free'}</dd>
              <dt>Proposed</dt><dd>{proposal ? `${money(proposal.amount, proposal.currency)} by ${proposal.proposedBy.fullName}` : 'No pending proposal'}</dd>
            </dl>
            {proposal && (
              <div className={a.stackSm} style={{ marginTop: 12 }}>
                {proposal.note && <p className={a.muted}>“{proposal.note}”</p>}
                <TextArea label="Note to creator" rows={2} value={priceNote} onChange={(e) => setPriceNote(e.target.value)} />
                <div className={a.row}>
                  <Button variant="primary" size="sm" disabled={ownCourse} loading={decidePrice.isPending} onClick={() => decidePrice.mutate({ proposalId: proposal.id, decision: 'APPROVED' })}>Approve price</Button>
                  <Button size="sm" disabled={ownCourse} onClick={() => decidePrice.mutate({ proposalId: proposal.id, decision: 'REJECTED' })}>Decline</Button>
                </div>
              </div>
            )}
          </Panel>
          <section>
            <h2 className={a.sectionTitle}>History</h2>
            <ul className={a.activity}>
              {c.reviews.map((r) => (
                <li key={r.id}><time>{dateTime(r.createdAt)}</time><span><StatusPill status={r.decision} /> {r.actor.fullName}{r.feedback && <span className={a.muted} style={{ display: 'block' }}>“{r.feedback}”</span>}</span></li>
              ))}
              {c.priceProposals.filter((p) => p.status !== 'PENDING').map((p) => (
                <li key={p.id}><time>{date(p.decidedAt ?? p.createdAt)}</time><span>Price {money(p.amount, p.currency)} <StatusPill status={p.status} /></span></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${ACTION_COPY[pending].label}: ${c.title}` : ''}
        actions={<><Button variant="tertiary" onClick={() => setPending(null)}>Cancel</Button>{pending && <Button variant={ACTION_COPY[pending].variant} loading={act.isPending} disabled={ACTION_COPY[pending].needsNote && !note.trim()} onClick={() => act.mutate(pending)}>{ACTION_COPY[pending].label}</Button>}</>}
      >
        {act.error && <Callout tone="danger">{errorMessage(act.error)}</Callout>}
        <TextArea label={pending && ACTION_COPY[pending].needsNote ? 'Feedback for the creator (required)' : 'Note for the creator (optional)'} value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
      </Dialog>
    </div>
  );
}
