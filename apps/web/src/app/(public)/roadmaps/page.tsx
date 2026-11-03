import Link from 'next/link';
import { serverGet } from '@/lib/server-api';
import { duration } from '@/lib/format';
import { EmptyState } from '@/components/ui/Feedback';
import s from '../public.module.scss';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Roadmaps' };

interface RoadmapSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  nodeCount: number;
  courseCount: number;
  estimatedMinutes: number;
  owner: { fullName: string };
}

export default async function RoadmapsPage() {
  const res = await serverGet<RoadmapSummary[]>('/roadmaps');
  const items = res.ok ? res.data : [];
  return (
    <div className={s.container}>
      <header className={s.discoverHead}>
        <h1 className={s.pageTitle}>Roadmaps</h1>
        <p className={s.detailLead}>Courses, practice and milestones in the order that makes them stick. Your progress shows on the map as you go.</p>
      </header>
      {!res.ok ? (
        <EmptyState title="Roadmaps are unavailable right now">Please try again in a moment.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState title="No roadmaps published yet" />
      ) : (
        <ul className={s.roadmapList}>
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/roadmaps/${r.slug}`}>
                <div>
                  <h2>{r.title}</h2>
                  <p>{r.summary}</p>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-3)', textAlign: 'right' }}>
                  {r.nodeCount} steps · {r.courseCount} courses
                  <br />≈ {duration(r.estimatedMinutes)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
