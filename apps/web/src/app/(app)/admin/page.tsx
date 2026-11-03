'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { amount, relative } from '@/lib/format';
import { ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { Facts, PageHead } from '../PageHead';
import a from '../app.module.scss';

interface Overview {
  totals: { learners: number; activeLearners: number; creators: number; publishedCourses: number; newUsers30: number };
  pending: { courses: number; creatorApplications: number; priceProposals: number; roadmaps: number };
  reviewQueue: { id: string; title: string; submittedAt: string; creator: { fullName: string } }[];
  transactions30: { status: string; count: number; amount: number }[];
  netRevenue30: number;
  attention: { kind: string; count: number; label: string; href: string }[];
  recentActivity: { id: string; action: string; resourceType: string; outcome: string; createdAt: string; actor: { fullName: string } | null }[];
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<Overview>('/admin/overview'), refetchInterval: 60_000 });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const d = q.data;
  const ok = d.transactions30.find((t) => t.status === 'SUCCESSFUL');
  const failed = d.transactions30.find((t) => t.status === 'FAILED');
  return (
    <div className={a.stack}>
      <PageHead title="Platform overview" subtitle="Live figures from the database. Activity windows are the last 30 days." />
      <Facts
        items={[
          { label: 'Learners', value: d.totals.learners },
          { label: 'Active (30 days)', value: d.totals.activeLearners },
          { label: 'Creators', value: d.totals.creators },
          { label: 'Published courses', value: d.totals.publishedCourses },
          { label: 'Net sales (30 days)', value: amount(d.netRevenue30) },
        ]}
      />
      <div className={a.split}>
        <div className={a.stack}>
          <section>
            <h2 className={a.sectionTitle}>Needs attention</h2>
            {d.attention.length === 0 ? (
              <p className={a.muted}>Nothing waiting. Queues are clear.</p>
            ) : (
              <ul className={a.queue}>
                {d.attention.map((x) => (
                  <li key={x.kind} className={a.queueItem}>
                    <span><span className={a.queueCount}>{x.count}</span> {x.label}</span>
                    <Link className={a.link} href={x.href}>Review <ArrowRight size={13} style={{ verticalAlign: '-2px' }} /></Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className={a.sectionTitle}>Course review queue</h2>
            {d.reviewQueue.length === 0 ? (
              <p className={a.muted}>No courses waiting for review.</p>
            ) : (
              <ul className={a.queue}>
                {d.reviewQueue.map((c) => (
                  <li key={c.id} className={a.queueItem}>
                    <span>
                      <Link href={`/admin/courses/${c.id}`} style={{ color: 'var(--ink-0)' }}>{c.title}</Link>
                      <span className={a.muted}> · {c.creator.fullName} · submitted {relative(c.submittedAt)}</span>
                    </span>
                    <Link className={a.link} href={`/admin/courses/${c.id}`}>Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className={a.sectionTitle}>Payments, last 30 days</h2>
            <dl className={a.dl}>
              <dt>Successful</dt><dd>{ok?.count ?? 0} · {amount(ok?.amount ?? 0)}</dd>
              <dt>Failed</dt><dd>{failed?.count ?? 0}</dd>
              {d.transactions30.filter((t) => !['SUCCESSFUL', 'FAILED'].includes(t.status)).map((t) => (
                <span key={t.status} style={{ display: 'contents' }}><dt>{t.status.charAt(0) + t.status.slice(1).toLowerCase()}</dt><dd>{t.count}</dd></span>
              ))}
            </dl>
          </section>
        </div>
        <aside>
          <h2 className={a.sectionTitle}>Recent activity</h2>
          <ul className={a.activity}>
            {d.recentActivity.map((e) => (
              <li key={e.id}>
                <time>{relative(e.createdAt)}</time>
                <span>
                  {e.actor?.fullName ?? 'System'} · <span className={a.mono}>{e.action}</span> {e.outcome !== 'SUCCESS' && <StatusPill status={e.outcome} />}
                </span>
              </li>
            ))}
          </ul>
          <Link className={a.link} href="/admin/audit-logs" style={{ display: 'inline-block', marginTop: 10 }}>Full audit log</Link>
        </aside>
      </div>
    </div>
  );
}
