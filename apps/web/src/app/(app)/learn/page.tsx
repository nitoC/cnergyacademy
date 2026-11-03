'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { relative } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import type { CourseProgress } from '@/types/api';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingBlock, Progress, StatusPill } from '@/components/ui/Feedback';
import { Facts, PageHead } from '../PageHead';
import a from '../app.module.scss';
import s from './learn.module.scss';

interface DashboardCourse {
  course: { id: string; title: string; slug: string; thumbnailUrl: string | null; coverPattern: string | null; subject: { name: string; accentColor: string | null }; creator: { fullName: string } };
  lastActivityAt: string;
  completedAt: string | null;
  progress: CourseProgress;
  nextLesson: { id: string; title: string | null } | null;
}
interface Dashboard {
  continueLearning: DashboardCourse | null;
  inProgress: DashboardCourse[];
  completed: DashboardCourse[];
  recentAttempts: { id: string; scorePercent: number; passed: boolean; submittedAt: string; quiz: { id: string; title: string; course: { title: string } } }[];
  summary: { certificates: number; openThreads: number; purchasedCourses: number; activeCourses: number };
}

function Row({ c }: { c: DashboardCourse }) {
  return (
    <li className={s.courseRow}>
      <div className={s.rowCover}>
        <CourseCover seed={c.course.slug} pattern={c.course.coverPattern} accent={c.course.subject.accentColor} thumbnailUrl={c.course.thumbnailUrl} />
      </div>
      <div>
        <Link href={`/learn/courses/${c.course.id}`} style={{ color: 'var(--ink-0)', fontWeight: 600 }}>
          {c.course.title}
        </Link>
        <div className={a.muted}>
          {c.course.subject.name} · last active {relative(c.lastActivityAt)}
        </div>
      </div>
      <div className={s.rowProgress}>
        <Progress value={c.progress.percent} label={`${c.course.title} progress`} />
        {c.progress.percent}% · {c.progress.itemsCompleted}/{c.progress.itemsTotal} steps
      </div>
      <ButtonLink size="sm" href={c.completedAt ? `/learn/courses/${c.course.id}` : c.nextLesson ? `/learn/lessons/${c.nextLesson.id}` : `/learn/courses/${c.course.id}`}>
        {c.completedAt ? 'Review' : 'Resume'}
      </ButtonLink>
    </li>
  );
}

export default function LearnerDashboard() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/learn/dashboard') });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={6} />;
  const d = q.data;
  const c = d.continueLearning;

  return (
    <div className={a.stack}>
      <PageHead title={`Good to see you, ${me?.fullName.split(' ')[0] ?? 'learner'}`} />

      {c ? (
        <section className={s.continue} aria-label="Continue learning">
          <div className={s.continueCover}>
            <CourseCover seed={c.course.slug} pattern={c.course.coverPattern} accent={c.course.subject.accentColor} thumbnailUrl={c.course.thumbnailUrl} />
          </div>
          <div className={s.continueBody}>
            <span className={a.muted}>Continue · {c.course.subject.name}</span>
            <h2 className={s.continueTitle}>{c.course.title}</h2>
            <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
              <Progress value={c.progress.percent} label="Course progress" />
              <span className={a.muted}>
                {c.progress.percent}% · {c.progress.lessonsCompleted} of {c.progress.lessonsTotal} lessons · {c.progress.quizzesPassed} of {c.progress.quizzesTotal} checkpoints
              </span>
            </div>
            {c.nextLesson && (
              <div className={s.nextUp}>
                <span>Next lesson</span>
                <strong>{c.nextLesson.title}</strong>
              </div>
            )}
            <div className={a.row}>
              <ButtonLink variant="primary" href={c.nextLesson ? `/learn/lessons/${c.nextLesson.id}` : `/learn/courses/${c.course.id}`} icon={<ArrowRight size={16} />}>
                Resume
              </ButtonLink>
              <ButtonLink variant="tertiary" href={`/learn/courses/${c.course.id}`}>
                See the journey
              </ButtonLink>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState title="Your trail starts with one course" action={<ButtonLink href="/courses" variant="primary">Browse courses</ButtonLink>}>
          Enrol in any course and it will appear here with your progress and next step.
        </EmptyState>
      )}

      <div className={a.split}>
        <div className={a.stack}>
          {d.inProgress.length > 0 && (
            <section>
              <h2 className={a.sectionTitle}>Also in progress</h2>
              <ul className={s.courseRows}>{d.inProgress.map((x) => <Row key={x.course.id} c={x} />)}</ul>
            </section>
          )}
          {d.completed.length > 0 && (
            <section>
              <h2 className={a.sectionTitle}>Completed</h2>
              <ul className={s.courseRows}>{d.completed.map((x) => <Row key={x.course.id} c={x} />)}</ul>
            </section>
          )}
        </div>
        <aside className={a.stack}>
          <Facts
            items={[
              { label: 'Certificates', value: d.summary.certificates },
              { label: 'Open questions', value: d.summary.openThreads },
            ]}
          />
          <section>
            <h2 className={a.sectionTitle}>Recent checkpoints</h2>
            {d.recentAttempts.length === 0 ? (
              <p className={a.muted}>Quiz results will show here.</p>
            ) : (
              <ul className={a.queue}>
                {d.recentAttempts.map((r) => (
                  <li key={r.id} className={a.queueItem}>
                    <Link href={`/learn/quizzes/${r.quiz.id}/attempts/${r.id}`}>
                      <span style={{ color: 'var(--ink-0)' }}>{r.quiz.title}</span>
                      <span className={a.muted} style={{ display: 'block' }}>{r.quiz.course.title} · {relative(r.submittedAt)}</span>
                    </Link>
                    <span className={a.row}>
                      <span className={a.mono}>{r.scorePercent}%</span>
                      <StatusPill status={r.passed ? 'PASSED' : 'FAILED'} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
