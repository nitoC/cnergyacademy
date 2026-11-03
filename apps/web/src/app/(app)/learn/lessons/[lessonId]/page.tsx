'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError, errorMessage, get, post } from '@/lib/api';
import type { CourseProgress, LessonBlock } from '@/types/api';
import { LessonRenderer } from '@/components/learning/LessonRenderer';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, LoadingBlock, useToast } from '@/components/ui/Feedback';
import { AskQuestion } from '@/features/support/AskQuestion';
import s from '../../learn.module.scss';

interface Neighbour { id: string; title: string; moduleTitle: string; locked: boolean; reason: string }
interface LessonView {
  lesson: { id: string; title: string; summary: string | null; content: LessonBlock[]; estimatedMinutes: number };
  module: { id: string; title: string; position: number; lessons: { id: string; title: string }[] };
  course: { id: string; title: string; slug: string };
  completed: boolean;
  preview: boolean;
  position: { index: number; total: number };
  previous: Neighbour | null;
  next: Neighbour | null;
  quizzes: { id: string; title: string }[];
}

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lesson', lessonId], queryFn: () => get<LessonView>(`/learn/lessons/${lessonId}`) });
  const complete = useMutation({
    mutationFn: () => post<{ progress: CourseProgress; newlyCompleted: boolean; certificate: { serial: string } | null }>(`/learn/lessons/${lessonId}/complete`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
      qc.invalidateQueries({ queryKey: ['journey', q.data?.course.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.certificate && r.newlyCompleted) {
        toast(`Course complete — certificate ${r.certificate.serial} issued.`);
        router.push('/learn/certificates');
        return;
      }
      const d = q.data!;
      if (d.quizzes[0]) router.push(`/learn/quizzes/${d.quizzes[0].id}`);
      else if (d.next && !d.next.locked) router.push(`/learn/lessons/${d.next.id}`);
      else router.push(`/learn/courses/${d.course.id}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.error) {
    const e = q.error;
    if (e instanceof ApiError && e.status === 403) {
      const details = e.details as { prerequisiteQuizId?: string } | undefined;
      return (
        <EmptyState
          title="This lesson is locked"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              {details?.prerequisiteQuizId && <ButtonLink href={`/learn/quizzes/${details.prerequisiteQuizId}`}>Take the prerequisite quiz</ButtonLink>}
              <ButtonLink href="/learn" variant="tertiary">Back to my learning</ButtonLink>
            </div>
          }
        >
          {e.message}
        </EmptyState>
      );
    }
    return <ErrorState error={e} retry={() => q.refetch()} />;
  }
  if (!q.data) return <LoadingBlock rows={10} />;
  const d = q.data;

  return (
    <div className={s.reader}>
      <aside className={s.toc} aria-label="Module lessons">
        <Link href={`/learn/courses/${d.course.id}`} style={{ color: 'var(--ink-2)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={14} /> {d.course.title}
        </Link>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Module {d.module.position} · {d.module.title}
        </span>
        <ol className={s.tocList}>
          {d.module.lessons.map((l) => (
            <li key={l.id}>
              <Link href={`/learn/lessons/${l.id}`} aria-current={l.id === d.lesson.id ? 'page' : undefined}>
                {l.title}
              </Link>
            </li>
          ))}
        </ol>
        <AskQuestion courseId={d.course.id} lessonId={d.lesson.id} lessonTitle={d.lesson.title} />
      </aside>

      <article>
        {d.preview && <Callout>Preview mode — completion is not recorded.</Callout>}
        <h1 className={s.lessonTitle}>{d.lesson.title}</h1>
        <p className={s.lessonMeta}>
          Lesson {d.position.index} of {d.position.total} · {d.lesson.estimatedMinutes} min read
          {d.completed && ' · completed'}
        </p>
        <LessonRenderer blocks={d.lesson.content} />

        <footer className={s.lessonFoot}>
          {!d.preview && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" size="lg" loading={complete.isPending} onClick={() => complete.mutate()} icon={d.completed ? <Check size={16} /> : undefined}>
                {d.completed ? 'Completed — continue' : d.quizzes[0] ? 'Mark complete & take the checkpoint' : 'Mark complete & continue'}
              </Button>
              {d.quizzes.map((qz) => (
                <ButtonLink key={qz.id} href={`/learn/quizzes/${qz.id}`} variant="tertiary">
                  {qz.title}
                </ButtonLink>
              ))}
            </div>
          )}
          <nav className={s.pager} aria-label="Lesson navigation">
            {d.previous ? (
              <Link href={`/learn/lessons/${d.previous.id}`}>
                <small>← Previous</small>
                {d.previous.title}
              </Link>
            ) : (
              <div aria-hidden />
            )}
            {d.next ? (
              d.next.locked ? (
                <Link href={`/learn/courses/${d.course.id}`} style={{ textAlign: 'right' }}>
                  <small>Next · locked</small>
                  {d.next.title}
                </Link>
              ) : (
                <Link href={`/learn/lessons/${d.next.id}`} style={{ textAlign: 'right' }}>
                  <small>Next <ArrowRight size={11} /></small>
                  {d.next.title}
                </Link>
              )
            ) : (
              <div aria-hidden />
            )}
          </nav>
        </footer>
      </article>
    </div>
  );
}
