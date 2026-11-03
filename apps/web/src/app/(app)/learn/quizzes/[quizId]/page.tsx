'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError, errorMessage, get, post } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';
import s from '../../learn.module.scss';

interface Overview {
  quiz: { id: string; title: string; description: string | null; passingScore: number; maxAttempts: number | null; cooldownMinutes: number; allowNavigation: boolean; questionCount: number };
  course: { id: string; title: string };
  unlocks: { id: string; title: string }[];
  preview: boolean;
  remaining: number | null;
  passed: boolean;
  inProgressId: string | null;
  blockedReason: string | null;
  cooldownUntil: string | null;
  history: { id: string; attemptNumber: number; scorePercent: number; passed: boolean; submittedAt: string }[];
}

export default function QuizOverview() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['quiz', quizId], queryFn: () => get<Overview>(`/quizzes/${quizId}`) });
  const start = useMutation({
    mutationFn: () => post<{ id: string }>(`/quizzes/${quizId}/attempts`),
    onSuccess: (attempt) => router.push(`/learn/quizzes/${quizId}/attempts/${attempt.id}`),
  });

  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 403)
      return <EmptyState title="This checkpoint is locked" action={<ButtonLink href="/learn">Back to my learning</ButtonLink>}>{q.error.message}</EmptyState>;
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  }
  if (!q.data) return <LoadingBlock />;
  const d = q.data;
  const blocked = d.blockedReason === 'NO_ATTEMPTS_REMAINING' ? 'You have used every attempt for this quiz.' : d.blockedReason === 'COOLDOWN' ? `You can try again after ${dateTime(d.cooldownUntil)}.` : null;

  return (
    <div className={s.quizWrap}>
      <PageHead crumbs={[{ href: `/learn/courses/${d.course.id}`, label: d.course.title }]} title={d.quiz.title} subtitle={d.quiz.description ?? undefined} />
      {d.passed && <Callout tone="forest">You have passed this checkpoint.{d.unlocks.length > 0 && ` It unlocks ${d.unlocks.map((u) => u.title).join(', ')}.`}</Callout>}
      {!d.passed && d.unlocks.length > 0 && <Callout>Passing this quiz unlocks: {d.unlocks.map((u) => u.title).join(', ')}.</Callout>}
      <dl className={a.dl}>
        <dt>Questions</dt><dd>{d.quiz.questionCount}</dd>
        <dt>Pass mark</dt><dd>{d.quiz.passingScore}%</dd>
        <dt>Attempts</dt><dd>{d.quiz.maxAttempts === null ? 'Unlimited' : `${d.remaining} of ${d.quiz.maxAttempts} remaining`}</dd>
        {d.quiz.cooldownMinutes > 0 && (<><dt>Between attempts</dt><dd>{d.quiz.cooldownMinutes} minutes</dd></>)}
        <dt>Navigation</dt><dd>{d.quiz.allowNavigation ? 'Move freely between questions' : 'Answer questions in order'}</dd>
      </dl>
      {start.error && <Callout tone="danger">{errorMessage(start.error)}</Callout>}
      {blocked ? (
        <Callout tone="danger">{blocked}</Callout>
      ) : (
        <div>
          <Button variant="primary" size="lg" loading={start.isPending} onClick={() => start.mutate()}>
            {d.inProgressId ? 'Resume attempt' : d.history.length ? 'Try again' : 'Start quiz'}
          </Button>
        </div>
      )}
      {d.history.length > 0 && (
        <section>
          <h2 className={a.sectionTitle}>Your attempts</h2>
          <ul className={a.queue}>
            {d.history.map((h) => (
              <li key={h.id} className={a.queueItem}>
                <Link href={`/learn/quizzes/${quizId}/attempts/${h.id}`}>
                  Attempt {h.attemptNumber} <span className={a.muted}>· {dateTime(h.submittedAt)}</span>
                </Link>
                <span className={a.row}>
                  <span className={a.mono}>{h.scorePercent}%</span>
                  <StatusPill status={h.passed ? 'PASSED' : 'FAILED'} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
