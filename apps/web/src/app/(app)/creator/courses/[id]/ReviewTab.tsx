'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { del, errorMessage, post } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import a from '../../../app.module.scss';
import type { EditorCourse } from './types';

export function ReviewTab({ course }: { course: EditorCourse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { data: me } = useMe();
  const isOwner = me?.id === course.creator.id;
  const act = useMutation({
    mutationFn: (action: string) => post(`/courses/${course.id}/transitions`, { action }),
    onSuccess: (_, action) => {
      qc.invalidateQueries({ queryKey: ['editor', course.id] });
      qc.invalidateQueries({ queryKey: ['creator'] });
      toast(`Course ${action === 'submit' ? 'submitted for review' : action === 'withdraw' ? 'withdrawn' : `${action}ed`.replace('eed', 'ed')}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({ mutationFn: () => del(`/creator/courses/${course.id}`), onSuccess: () => router.push('/creator/courses'), onError: (e) => toast(errorMessage(e), 'error') });
  const r = course.readiness;

  return (
    <div className={a.split}>
      <div className={a.stack}>
        <Panel>
          <h2 className={a.sectionTitle}>Readiness</h2>
          {r.issues.length === 0 ? (
            <Callout tone="forest">Everything needed for review is in place.</Callout>
          ) : (
            <ul className={a.queue}>
              {r.issues.map((i) => (
                <li key={i} className={a.queueItem}><span><X size={14} color="var(--terracotta-300)" style={{ verticalAlign: '-2px' }} /> {i}</span><span /></li>
              ))}
            </ul>
          )}
          {r.needsApprovedPrice && <div style={{ marginTop: 10 }}><Callout>Premium modules need an approved price before publishing.</Callout></div>}
        </Panel>
        <Panel>
          <h2 className={a.sectionTitle}>Next step</h2>
          <div className={a.row}>
            {isOwner && (course.status === 'DRAFT' || course.status === 'REJECTED') && (
              <Button variant="primary" icon={<Check size={15} />} disabled={!r.canSubmit} loading={act.isPending} onClick={() => act.mutate('submit')}>Submit for review</Button>
            )}
            {isOwner && course.status === 'SUBMITTED' && <Button loading={act.isPending} onClick={() => act.mutate('withdraw')}>Withdraw from review</Button>}
            {course.status === 'APPROVED' && <Button variant="primary" loading={act.isPending} disabled={r.needsApprovedPrice} onClick={() => act.mutate('publish')}>Publish now</Button>}
            {['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED'].includes(course.status) && (
              <Button variant="tertiary" loading={act.isPending} onClick={() => confirm('Archive this course? Learners keep their progress but it leaves the catalogue.') && act.mutate('archive')}>Archive</Button>
            )}
            {course.status === 'ARCHIVED' && <Button onClick={() => act.mutate('restore')}>Restore as draft</Button>}
            {course.status === 'DRAFT' && <Button variant="danger" loading={remove.isPending} onClick={() => confirm('Delete this draft permanently?') && remove.mutate()}>Delete draft</Button>}
          </div>
        </Panel>
      </div>
      <aside>
        <h2 className={a.sectionTitle}>Review history</h2>
        {course.reviews.length === 0 ? (
          <p className={a.muted}>Not submitted yet.</p>
        ) : (
          <ul className={a.activity}>
            {course.reviews.map((rv) => (
              <li key={rv.id}>
                <time>{dateTime(rv.createdAt)}</time>
                <span>
                  <StatusPill status={rv.decision} /> {rv.actor.fullName}
                  {rv.feedback && <span className={a.muted} style={{ display: 'block', marginTop: 4 }}>“{rv.feedback}”</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
