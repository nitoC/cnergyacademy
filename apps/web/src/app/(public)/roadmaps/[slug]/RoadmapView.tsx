'use client';
import Link from 'next/link';
import { RoadmapBoard, useRoadmap } from '@/features/roadmaps/RoadmapBoard';
import { Callout, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import s from '../../public.module.scss';

export function RoadmapView({ slug }: { slug: string }) {
  const { query: q } = useRoadmap(`/roadmaps/${slug}`);
  if (q.error) return <div className={s.container} style={{ paddingTop: 48 }}><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <div className={s.container} style={{ paddingTop: 48 }}><LoadingBlock /></div>;
  const r = q.data;
  return (
    <div className={s.container}>
      <header className={s.discoverHead}>
        {r.preview && <Callout>Preview — learners will see this roadmap once {r.course ? 'the course is published' : 'it is published'}.</Callout>}
        {r.course && (
          <Link href={`/courses/${r.course.slug}`} style={{ color: 'var(--amber-300)', fontSize: '0.88rem', fontWeight: 600 }}>
            Course roadmap · {r.course.title} →
          </Link>
        )}
        <h1 className={s.pageTitle}>{r.title}</h1>
        <p className={s.detailLead}>{r.summary}</p>
      </header>
      <RoadmapBoard path={`/roadmaps/${slug}`} />
    </div>
  );
}
