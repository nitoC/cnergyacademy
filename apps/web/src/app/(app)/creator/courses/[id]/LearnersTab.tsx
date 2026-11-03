'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { date, relative } from '@/lib/format';
import { ErrorState, LoadingBlock, Progress } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import a from '../../../app.module.scss';

interface Learners {
  learners: { learner: { fullName: string; email: string }; enrolledAt: string; lastActivityAt: string; completedAt: string | null; percent: number }[];
  distribution: { label: string; count: number }[];
}

export function LearnersTab({ courseId }: { courseId: string }) {
  const q = useQuery({ queryKey: ['creator', 'learners', courseId], queryFn: () => get<Learners>(`/creator/courses/${courseId}/learners`) });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const max = Math.max(1, ...q.data.distribution.map((d) => d.count));
  return (
    <div className={a.split}>
      <DataTable
        rows={q.data.learners}
        rowKey={(r) => r.learner.email}
        empty="No learners yet"
        columns={[
          { key: 'l', header: 'Learner', render: (r) => <Cell primary={r.learner.fullName} secondary={r.learner.email} /> },
          { key: 'e', header: 'Enrolled', render: (r) => date(r.enrolledAt) },
          { key: 'a', header: 'Last active', render: (r) => relative(r.lastActivityAt) },
          { key: 'p', header: 'Progress', render: (r) => <div style={{ minWidth: 120, display: 'grid', gap: 4 }}><Progress value={r.percent} /><span className={a.muted}>{r.completedAt ? `Completed ${date(r.completedAt)}` : `${r.percent}%`}</span></div> },
        ]}
      />
      <aside>
        <h2 className={a.sectionTitle}>Progress distribution</h2>
        <div className={a.bars}>
          {q.data.distribution.map((d) => (
            <div key={d.label} className={a.bar}>
              <span>{d.label}</span>
              <span className={a.barTrack}><span style={{ width: `${(d.count / max) * 100}%` }} /></span>
              <span className={a.barValue}>{d.count}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
