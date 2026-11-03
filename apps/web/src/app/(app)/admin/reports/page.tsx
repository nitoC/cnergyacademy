'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import { Facts, PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Report {
  courses: { id: string; title: string; status: string; creator: string; enrollments: number; completions: number; completionRate: number; certificates: number; quizAttempts: number; averageScore: number | null; passRate: number | null }[];
  daily: { day: string; enrollments: number; lessons: number }[];
  certificates: Record<string, number>;
  activeLearners30: number;
}

export default function ReportsPage() {
  const q = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => get<Report>('/admin/reports/learners') });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const d = q.data;
  const max = Math.max(1, ...d.daily.map((x) => x.lessons));
  const totalEnrol = d.courses.reduce((s, c) => s + c.enrollments, 0);
  const totalDone = d.courses.reduce((s, c) => s + c.completions, 0);
  return (
    <div className={a.stack}>
      <PageHead title="Learner reports" subtitle="Enrolment, completion and assessment performance by course." />
      <Facts items={[
        { label: 'Active learners (30 days)', value: d.activeLearners30 },
        { label: 'Enrolments', value: totalEnrol },
        { label: 'Completions', value: `${totalDone} (${totalEnrol ? Math.round((totalDone / totalEnrol) * 100) : 0}%)` },
        { label: 'Certificates valid', value: d.certificates.VALID ?? 0 },
        { label: 'Certificates revoked', value: d.certificates.REVOKED ?? 0 },
      ]} />
      <section>
        <h2 className={a.sectionTitle}>Lessons completed per day, last 30 days</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, borderBottom: '1px solid var(--line-strong)' }} role="img" aria-label="Daily lesson completions">
          {d.daily.map((x) => (
            <div key={x.day} title={`${new Date(x.day).toLocaleDateString('en-GB')}: ${x.lessons} lessons, ${x.enrollments} enrolments`} style={{ flex: 1, height: `${Math.max(2, (x.lessons / max) * 100)}%`, background: x.lessons ? 'var(--forest-500)' : 'var(--surface-3)', borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
      </section>
      <DataTable rows={d.courses} rowKey={(c) => c.id} empty="No courses" columns={[
        { key: 't', header: 'Course', render: (c) => <Cell primary={c.title} secondary={c.creator} /> },
        { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
        { key: 'e', header: 'Enrolled', numeric: true, render: (c) => c.enrollments },
        { key: 'c', header: 'Completed', numeric: true, render: (c) => `${c.completions} · ${c.completionRate}%` },
        { key: 'q', header: 'Quiz attempts', numeric: true, render: (c) => c.quizAttempts },
        { key: 'avg', header: 'Avg score', numeric: true, render: (c) => (c.averageScore === null ? '—' : `${c.averageScore}%`) },
        { key: 'p', header: 'Pass rate', numeric: true, render: (c) => (c.passRate === null ? '—' : `${c.passRate}%`) },
        { key: 'cert', header: 'Certificates', numeric: true, render: (c) => c.certificates },
      ]} />
    </div>
  );
}
