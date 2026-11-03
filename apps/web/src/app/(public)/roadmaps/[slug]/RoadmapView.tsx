'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, errorMessage, get, post } from '@/lib/api';
import { duration, money } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import { RoadmapGraph } from '@/components/roadmap/RoadmapGraph';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Progress, useToast } from '@/components/ui/Feedback';
import s from '../../public.module.scss';

export interface RoadmapNode {
  id: string;
  type: string;
  title: string;
  description: string | null;
  position: number;
  level: number;
  isOptional: boolean;
  state: string;
  action: string;
  blockingNodeIds: string[];
  course: { id: string; slug: string; title: string; approvedPrice: number | null; currency: string; estimatedMinutes: number } | null;
}
export interface RoadmapViewData {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  preview: boolean;
  owner: { fullName: string };
  progress: { completed: number; total: number; percent: number };
  nodes: RoadmapNode[];
  edges: { id: string; fromNodeId: string; toNodeId: string }[];
}

export function RoadmapView({ slug }: { slug: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['roadmap', slug, me?.id ?? 'anon'];
  const q = useQuery({ queryKey: key, queryFn: () => get<RoadmapViewData>(`/roadmaps/${slug}`) });
  const mark = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => (done ? del<RoadmapViewData>(`/roadmap-nodes/${id}/complete`) : post<RoadmapViewData>(`/roadmap-nodes/${id}/complete`)),
    onSuccess: (data) => qc.setQueryData(key, data),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.error) return <div className={s.container} style={{ paddingTop: 48 }}><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <div className={s.container} style={{ paddingTop: 48 }}><LoadingBlock /></div>;
  const r = q.data;
  const byId = new Map(r.nodes.map((n) => [n.id, n]));

  const actions = (n: RoadmapNode) => {
    const c = n.course;
    switch (n.action) {
      case 'START_LEARNING':
        return c && <ButtonLink size="sm" variant="primary" href={`/courses/${c.slug}`}>Start learning</ButtonLink>;
      case 'RESUME_LEARNING':
        return c && <ButtonLink size="sm" variant="primary" href={`/learn/courses/${c.id}`}>Resume learning</ButtonLink>;
      case 'VIEW_COURSE':
        return c && <ButtonLink size="sm" href={`/courses/${c.slug}`}>View course</ButtonLink>;
      case 'UNLOCK_COURSE':
        return (
          c && (
            <>
              <ButtonLink size="sm" variant="amber" href={me ? `/checkout/${c.id}` : `/login?next=/checkout/${c.id}`}>Unlock course</ButtonLink>
              <ButtonLink size="sm" variant="tertiary" href={`/courses/${c.slug}`}>Details</ButtonLink>
            </>
          )
        );
      case 'COMPLETE_PREREQUISITE': {
        const first = byId.get(n.blockingNodeIds[0]);
        return first && <span style={{ fontSize: '0.76rem', color: 'var(--ink-3)' }}>Complete prerequisite: {first.title}</span>;
      }
      case 'MARK_COMPLETE':
        return me ? (
          <Button size="sm" loading={mark.isPending && mark.variables?.id === n.id} onClick={() => mark.mutate({ id: n.id, done: false })}>Mark complete</Button>
        ) : null;
      default:
        return n.state === 'COMPLETED' && !n.course && me ? (
          <Button size="sm" variant="tertiary" onClick={() => mark.mutate({ id: n.id, done: true })}>Undo</Button>
        ) : null;
    }
  };

  return (
    <div className={s.container}>
      <header className={s.discoverHead}>
        {r.preview && <Callout>Preview — this roadmap is {r.status.toLowerCase()} and not visible to learners.</Callout>}
        <h1 className={s.pageTitle}>{r.title}</h1>
        <p className={s.detailLead}>{r.summary}</p>
        {me ? (
          <div style={{ maxWidth: 420, display: 'grid', gap: 6, fontSize: '0.85rem', color: 'var(--ink-2)' }}>
            <Progress value={r.progress.percent} label="Roadmap progress" />
            {r.progress.completed} of {r.progress.total} steps complete
          </div>
        ) : (
          <p style={{ fontSize: '0.88rem', color: 'var(--ink-3)' }}>Sign in to track your progress on this roadmap.</p>
        )}
      </header>
      <RoadmapGraph
        nodes={r.nodes}
        edges={r.edges}
        renderBody={(n) => (
          <>
            {n.course && (
              <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)' }}>
                {duration(n.course.estimatedMinutes)} · {money(n.course.approvedPrice, n.course.currency)}
              </div>
            )}
            {n.description && <div style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>{n.description}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{actions(n)}</div>
          </>
        )}
      />
    </div>
  );
}
