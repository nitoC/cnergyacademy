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
  moduleCount: number;
  owner: { fullName: string };
  course: { title: string; slug: string } | null;
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
        <>
          {[
            { heading: 'Learning paths', note: 'Several courses in the order that makes them stick.', items: items.filter((r) => !r.course) },
            { heading: 'Course roadmaps', note: 'Each course’s own map, set out by its creator.', items: items.filter((r) => r.course) },
          ]
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.heading} style={{ marginBottom: 48 }}>
                <h2 className={s.h2} style={{ marginBottom: 4 }}>{g.heading}</h2>
                <p style={{ color: 'var(--ink-3)', fontSize: '0.88rem', marginBottom: 14 }}>{g.note}</p>
                <ul className={s.roadmapList}>
                  {g.items.map((r) => (
                    <li key={r.id}>
                      <Link href={`/roadmaps/${r.slug}`}>
                        <div>
                          <h2>{r.course ? r.course.title : r.title}</h2>
                          <p>{r.summary}</p>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-3)', textAlign: 'right' }}>
                          {r.nodeCount} steps
                          {r.course ? ` · ${r.moduleCount} modules` : ` · ${r.courseCount} courses`}
                          {!r.course && (
                            <>
                              <br />≈ {duration(r.estimatedMinutes)}
                            </>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </>
      )}
    </div>
  );
}
