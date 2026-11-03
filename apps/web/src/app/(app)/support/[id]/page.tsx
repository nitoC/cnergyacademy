'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessage, get, patch, post } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';
import s from '../support.module.scss';

interface Thread {
  id: string;
  subject: string;
  status: string;
  course: { id: string; title: string; slug: string; creator: { id: string; fullName: string } };
  lesson: { id: string; title: string } | null;
  learner: { id: string; fullName: string };
  mentor: { id: string; fullName: string } | null;
  viewerRole: 'learner' | 'responder' | 'overseer';
  availableMentors: { id: string; fullName: string }[];
}
interface Message { id: string; body: string; createdAt: string; author: { id: string; fullName: string; roles: string[] } }
interface Page { items: Message[]; hasMore: boolean; nextCursor: string | null }

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const thread = useQuery({ queryKey: ['thread', id], queryFn: () => get<Thread>(`/support-threads/${id}`) });
  const messages = useInfiniteQuery({
    queryKey: ['thread', id, 'messages'],
    queryFn: ({ pageParam }) => get<Page>(`/support-threads/${id}/messages`, { before: pageParam ?? undefined, limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    refetchInterval: 15_000, // asynchronous messaging; polling keeps the thread fresh
  });
  useEffect(() => {
    post(`/support-threads/${id}/read`)
      .then(() => qc.invalidateQueries({ queryKey: ['support', 'unread'] }))
      .catch(() => undefined);
  }, [id, qc, messages.dataUpdatedAt]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['thread', id] });
    qc.invalidateQueries({ queryKey: ['threads'] });
  };
  const send = useMutation({
    mutationFn: () => post(`/support-threads/${id}/messages`, { body }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const setStatus = useMutation({ mutationFn: (action: 'resolve' | 'reopen') => post(`/support-threads/${id}/${action}`), onSuccess: refresh, onError: (e) => toast(errorMessage(e), 'error') });
  const assign = useMutation({
    mutationFn: (mentorId: string) => patch(`/support-threads/${id}/mentor`, { mentorId: mentorId || null }),
    onSuccess: () => {
      toast('Mentor updated');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (thread.error) return <ErrorState error={thread.error} />;
  if (!thread.data) return <LoadingBlock />;
  const t = thread.data;
  const all = (messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();
  const canAssign = t.viewerRole !== 'learner' && (me?.id === t.course.creator.id || me?.permissions.includes('mentors.manage') || me?.permissions.includes('support.oversee'));
  const readOnly = t.viewerRole === 'overseer' && !me?.permissions.includes('support.respond');

  return (
    <div className={a.split}>
      <div className={a.stack}>
        <PageHead crumbs={[{ href: t.viewerRole === 'learner' ? '/support' : '/support?scope=inbox', label: 'Questions' }]} title={t.subject} subtitle={`${t.course.title}${t.lesson ? ` · ${t.lesson.title}` : ''}`} />
        {messages.hasNextPage && (
          <Button size="sm" variant="tertiary" loading={messages.isFetchingNextPage} onClick={() => messages.fetchNextPage()}>
            Load earlier messages
          </Button>
        )}
        <ol className={s.messages} aria-live="polite">
          {all.map((m) => {
            const mine = m.author.id === me?.id;
            const staff = m.author.id !== t.learner.id;
            return (
              <li key={m.id} className={`${s.message} ${mine ? s.mine : ''}`}>
                <header>
                  <strong>{m.author.fullName}</strong>
                  {staff && <span className={s.role}>{m.author.id === t.course.creator.id ? 'Creator' : 'Mentor'}</span>}
                  <time>{dateTime(m.createdAt)}</time>
                </header>
                <p>{m.body}</p>
              </li>
            );
          })}
        </ol>
        {readOnly ? (
          <Callout>Oversight view — read only.</Callout>
        ) : t.status === 'RESOLVED' ? (
          <Callout>
            This conversation is resolved.{' '}
            <Button size="sm" onClick={() => setStatus.mutate('reopen')} loading={setStatus.isPending}>Reopen</Button>
          </Callout>
        ) : (
          <form
            className={a.stackSm}
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
          >
            <TextArea label="Reply" hideLabel placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={8000} />
            <div className={a.row}>
              <Button type="submit" variant="primary" loading={send.isPending} disabled={!body.trim()}>Send reply</Button>
            </div>
          </form>
        )}
      </div>
      <aside className={a.stackSm}>
        <dl className={a.dl} style={{ gridTemplateColumns: '90px 1fr' }}>
          <dt>Status</dt><dd><StatusPill status={t.status} /></dd>
          <dt>Learner</dt><dd>{t.learner.fullName}</dd>
          <dt>Mentor</dt><dd>{t.mentor?.fullName ?? `${t.course.creator.fullName} (creator)`}</dd>
        </dl>
        {canAssign && (
          <Select
            label="Assign mentor"
            value={t.mentor?.id ?? ''}
            onChange={(v) => assign.mutate(v)}
            options={[{ value: '', label: 'Course creator handles it' }, ...t.availableMentors.map((m) => ({ value: m.id, label: m.fullName }))]}
          />
        )}
        {t.status !== 'RESOLVED' && !readOnly && (
          <Button onClick={() => setStatus.mutate('resolve')} loading={setStatus.isPending}>
            Mark as resolved
          </Button>
        )}
      </aside>
    </div>
  );
}
