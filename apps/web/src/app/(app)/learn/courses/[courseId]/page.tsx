'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, KeyRound, Lock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import type { Journey } from '@/types/api';
import { WindingJourney, type JourneySelection } from '@/components/learning/WindingJourney';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Progress, useToast } from '@/components/ui/Feedback';
import { AskQuestion } from '@/features/support/AskQuestion';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';
import s from '../../learn.module.scss';

export default function JourneyPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [locked, setLocked] = useState<JourneySelection | null>(null);
  const q = useQuery({ queryKey: ['journey', courseId], queryFn: () => get<Journey>(`/learn/courses/${courseId}/journey`) });
  const enroll = useMutation({
    mutationFn: () => post('/enrollments', { courseId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journey', courseId] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const j = q.data;

  const select = (sel: JourneySelection) => {
    const state = sel.kind === 'module' ? sel.module.state : sel.checkpoint.state;
    if (state.startsWith('LOCKED')) return setLocked(sel);
    if (sel.kind === 'module') {
      const first = sel.module.checkpoints.find((c) => c.state !== 'COMPLETED') ?? sel.module.checkpoints[0];
      if (!first) return;
      router.push(first.kind === 'lesson' ? `/learn/lessons/${first.id}` : `/learn/quizzes/${first.id}`);
      return;
    }
    router.push(sel.checkpoint.kind === 'lesson' ? `/learn/lessons/${sel.checkpoint.id}` : `/learn/quizzes/${sel.checkpoint.id}`);
  };

  const lockedModule = locked?.module;
  const nextLesson = j.progress.nextLessonId;

  return (
    <div className={a.stack}>
      <div className={s.journeyHead}>
        <PageHead
          crumbs={[{ href: '/learn', label: 'My learning' }]}
          title={j.course.title}
          subtitle={`${j.course.subject.name} · by ${j.course.creator.fullName}`}
        />
      </div>
      {j.preview && <Callout>Staff preview — every module is open to you and progress is not recorded.</Callout>}
      <div className={s.journeyLayout}>
        <WindingJourney journey={j} onSelect={select} />
        <aside className={s.journeyStatus} aria-label="Course status">
          <div className={s.ring}>
            <strong>{j.progress.percent}%</strong>
            <span className={a.muted}>
              {j.progress.lessonsCompleted}/{j.progress.lessonsTotal} lessons
              <br />
              {j.progress.quizzesPassed}/{j.progress.quizzesTotal} checkpoints
            </span>
          </div>
          <Progress value={j.progress.percent} label="Course progress" />
          {!j.enrolled && !j.preview ? (
            <Button variant="primary" block loading={enroll.isPending} onClick={() => enroll.mutate()}>
              Enrol to track progress
            </Button>
          ) : j.progress.isComplete ? (
            j.certificate ? (
              <ButtonLink variant="amber" block href="/learn/certificates" icon={<Award size={16} />}>
                View certificate
              </ButtonLink>
            ) : (
              <Callout tone="forest">Course complete.</Callout>
            )
          ) : (
            nextLesson && (
              <ButtonLink variant="primary" block href={`/learn/lessons/${nextLesson}`}>
                Resume where you left off
              </ButtonLink>
            )
          )}
          {j.isPaidCourse && !j.hasEntitlement && !j.preview && (
            <ButtonLink variant="amber" block href={`/checkout/${j.course.id}`}>
              Unlock full course · {money(j.course.approvedPrice, j.course.currency)}
            </ButtonLink>
          )}
          {j.enrolled && <AskQuestion courseId={j.course.id} />}
          <div className={s.legend} aria-label="Legend">
            <span><i style={{ background: 'var(--forest-500)', borderColor: 'var(--forest-300)' }} /> Done</span>
            <span><i style={{ borderColor: 'var(--amber-300)' }} /> You are here</span>
            <span><i style={{ borderColor: 'var(--terracotta-500)' }} /> Premium</span>
            <span><i style={{ borderColor: 'var(--amber-500)', borderStyle: 'dashed' }} /> Needs quiz</span>
          </div>
        </aside>
      </div>

      <Dialog
        open={!!locked}
        onClose={() => setLocked(null)}
        title={lockedModule?.decision.requiresPurchase ? 'Part of the full course' : 'Pass the checkpoint first'}
        actions={
          <>
            <Button variant="tertiary" onClick={() => setLocked(null)}>Not now</Button>
            {lockedModule?.decision.requiresPrerequisite && lockedModule.prerequisiteQuiz && (
              <ButtonLink variant="secondary" href={`/learn/quizzes/${lockedModule.prerequisiteQuiz.id}`} icon={<KeyRound size={15} />}>
                Complete prerequisite
              </ButtonLink>
            )}
            {lockedModule?.decision.requiresPurchase && (
              <ButtonLink variant="amber" href={`/checkout/${j.course.id}`} icon={<Lock size={15} />}>
                Unlock course
              </ButtonLink>
            )}
          </>
        }
      >
        {lockedModule && (
          <div className={a.stackSm}>
            <p>
              <strong style={{ color: 'var(--ink-0)' }}>{lockedModule.title}</strong>
            </p>
            {lockedModule.decision.requiresPurchase && <p>This module is included when you buy the course. Your progress so far is kept.</p>}
            {lockedModule.decision.requiresPrerequisite && lockedModule.prerequisiteQuiz && (
              <p>
                Pass “{lockedModule.prerequisiteQuiz.title}” to open it.
                {lockedModule.decision.requiresPurchase && ' Buying the course does not skip this checkpoint.'}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
