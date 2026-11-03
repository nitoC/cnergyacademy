'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { amount, relative } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import { Facts, PageHead } from '../PageHead';
import a from '../app.module.scss';

interface CreatorDashboard {
  byStatus: Record<string, number>;
  courses: { id: string; title: string; status: string; updatedAt: string; price: number; enrollments: number; completions: number; certificates: number; lastReview: { decision: string; feedback: string | null } | null }[];
  quizPerformance: { quizId: string; title: string; courseTitle: string; attempts: number; avg: number | null; passRate: number | null }[];
  awaitingResponse: { id: string; subject: string; lastMessageAt: string; learner: { fullName: string }; course: { title: string } }[];
  activity: { kind: string; at: string; text: string }[];
  earnings: { revenueShareConfigured: boolean; creatorSharePercent: number | null; grossSales: number; refunds: number; sales: number; earnings: number | null };
}

export default function CreatorOverview() {
  const q = useQuery({ queryKey: ['creator', 'dashboard'], queryFn: () => get<CreatorDashboard>('/creator/dashboard') });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const d = q.data;
  const totalLearners = d.courses.reduce((s, c) => s + c.enrollments, 0);
  const totalCompletions = d.courses.reduce((s, c) => s + c.completions, 0);

  return (
    <div className={a.stack}>
      <PageHead title="Creator workspace" actions={<ButtonLink href="/creator/courses/new" variant="primary" icon={<Plus size={16} />}>New course</ButtonLink>} />
      <Facts
        items={[
          { label: 'Published', value: d.byStatus.PUBLISHED ?? 0 },
          { label: 'Awaiting review', value: d.byStatus.SUBMITTED ?? 0 },
          { label: 'Drafts', value: (d.byStatus.DRAFT ?? 0) + (d.byStatus.REJECTED ?? 0) },
          { label: 'Learners enrolled', value: totalLearners },
          { label: 'Completions', value: totalCompletions },
        ]}
      />
      <div className={a.split}>
        <div className={a.stack}>
          <section>
            <h2 className={a.sectionTitle}>Your courses</h2>
            <DataTable
              rows={d.courses}
              rowKey={(c) => c.id}
              empty="No courses yet — start your first one"
              columns={[
                { key: 't', header: 'Course', render: (c) => <Link href={`/creator/courses/${c.id}`}><Cell primary={c.title} secondary={c.lastReview?.decision === 'REJECTED' ? `Changes requested: ${c.lastReview.feedback ?? ''}` : `Updated ${relative(c.updatedAt)}`} /></Link> },
                { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
                { key: 'e', header: 'Learners', numeric: true, render: (c) => c.enrollments },
                { key: 'c', header: 'Completed', numeric: true, render: (c) => (c.enrollments ? `${c.completions} (${Math.round((c.completions / c.enrollments) * 100)}%)` : '—') },
                { key: 'l', header: '', render: (c) => <Link className={a.link} href={`/creator/courses/${c.id}?tab=learners`}>Progress</Link> },
              ]}
            />
          </section>
          <section>
            <h2 className={a.sectionTitle}>Quiz performance</h2>
            <DataTable
              rows={d.quizPerformance}
              rowKey={(r) => r.quizId}
              empty="No quiz attempts yet"
              columns={[
                { key: 'q', header: 'Quiz', render: (r) => <Cell primary={r.title} secondary={r.courseTitle} /> },
                { key: 'a', header: 'Attempts', numeric: true, render: (r) => r.attempts },
                { key: 'avg', header: 'Average', numeric: true, render: (r) => (r.avg === null ? '—' : `${r.avg}%`) },
                { key: 'p', header: 'Pass rate', numeric: true, render: (r) => (r.passRate === null ? '—' : `${r.passRate}%`) },
              ]}
            />
          </section>
        </div>
        <aside className={a.stack}>
          <section>
            <h2 className={a.sectionTitle}>Earnings</h2>
            <dl className={a.dl} style={{ gridTemplateColumns: '120px 1fr' }}>
              <dt>Gross sales</dt><dd>{amount(d.earnings.grossSales)} · {d.earnings.sales} sales</dd>
              <dt>Refunds</dt><dd>{amount(d.earnings.refunds)}</dd>
              <dt>Your earnings</dt><dd>{d.earnings.earnings === null ? '—' : amount(d.earnings.earnings)}</dd>
            </dl>
            {!d.earnings.revenueShareConfigured && <div style={{ marginTop: 10 }}><Callout>The revenue share has not been set by the platform yet. Sales are recorded in full and earnings will be allocated once it is.</Callout></div>}
          </section>
          <section>
            <h2 className={a.sectionTitle}>Waiting for your reply</h2>
            {d.awaitingResponse.length === 0 ? (
              <p className={a.muted}>No unanswered questions.</p>
            ) : (
              <ul className={a.queue}>
                {d.awaitingResponse.map((t) => (
                  <li key={t.id} className={a.queueItem}>
                    <Link href={`/support/${t.id}`}>
                      <span style={{ color: 'var(--ink-0)' }}>{t.subject}</span>
                      <span className={a.muted} style={{ display: 'block' }}>{t.learner.fullName} · {t.course.title}</span>
                    </Link>
                    <span className={a.muted}>{relative(t.lastMessageAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className={a.sectionTitle}>Recent activity</h2>
            {d.activity.length === 0 ? (
              <p className={a.muted}>Nothing yet.</p>
            ) : (
              <ul className={a.activity}>
                {d.activity.map((e, i) => (
                  <li key={i}>
                    <time>{relative(e.at)}</time>
                    <span>{e.text}</span>
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
