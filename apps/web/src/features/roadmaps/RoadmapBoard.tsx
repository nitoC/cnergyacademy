'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { del, errorMessage, get, post } from '@/lib/api';
import { duration, money } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import { RoadmapGraph, STATE_LABEL } from '@/components/roadmap/RoadmapGraph';
import rs from '@/components/roadmap/roadmap.module.scss';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog, ErrorState, LoadingBlock, Pill, Progress, useToast } from '@/components/ui/Feedback';

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
  module: { id: string; title: string; position: number; course: { id: string; slug: string; title: string } | null; prerequisiteQuizId: string | null } | null;
}
export interface RoadmapViewData {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  preview: boolean;
  owner: { fullName: string };
  course: { id: string; title: string; slug: string; status: string; approvedPrice: number | null; currency: string } | null;
  progress: { completed: number; total: number; percent: number };
  nodes: RoadmapNode[];
  edges: { id: string; fromNodeId: string; toNodeId: string }[];
}

export function useRoadmap(path: string) {
  const { data: me } = useMe();
  const key = ['roadmap', path, me?.id ?? 'anon'];
  return { key, query: useQuery({ queryKey: key, queryFn: () => get<RoadmapViewData>(path) }) };
}

/**
 * Interactive roadmap: progress, legend, the spine-and-branch graph and a
 * details dialog with the right next action for each step. Used on roadmap
 * pages and on every course page.
 */
export function RoadmapBoard({ path, showProgress = true }: { path: string; showProgress?: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { key, query: q } = useRoadmap(path);
  const mark = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => (done ? del<RoadmapViewData>(`/roadmap-nodes/${id}/complete`) : post<RoadmapViewData>(`/roadmap-nodes/${id}/complete`)),
    onSuccess: (data) => qc.setQueryData(key, data),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const r = q.data;
  const byId = new Map(r.nodes.map((n) => [n.id, n]));
  const signIn = (to: string) => `/login?next=${encodeURIComponent(to)}`;

  const actions = (n: RoadmapNode) => {
    // A module of the roadmap's own course.
    if (n.module) {
      const course = n.module.course ?? r.course;
      if (!course) return null;
      const journey = `/learn/courses/${course.id}`;
      switch (n.action) {
        case 'START_LEARNING':
          return <ButtonLink size="sm" variant="primary" href={me ? journey : signIn(`/courses/${course.slug}`)}>Start learning</ButtonLink>;
        case 'RESUME_LEARNING':
          return <ButtonLink size="sm" variant="primary" href={journey}>Resume learning</ButtonLink>;
        case 'VIEW_COURSE':
          return <ButtonLink size="sm" href={journey}>Review module</ButtonLink>;
        case 'UNLOCK_COURSE':
          return <ButtonLink size="sm" variant="amber" href={me ? `/checkout/${course.id}` : signIn(`/checkout/${course.id}`)}>Unlock course</ButtonLink>;
        default:
          return n.module.prerequisiteQuizId && me ? <ButtonLink size="sm" href={`/learn/quizzes/${n.module.prerequisiteQuizId}`}>Take the checkpoint</ButtonLink> : null;
      }
    }
    const c = n.course;
    switch (n.action) {
      case 'START_LEARNING':
        return c && <ButtonLink size="sm" variant="primary" href={`/courses/${c.slug}`}>Start learning</ButtonLink>;
      case 'RESUME_LEARNING':
        return c && <ButtonLink size="sm" variant="primary" href={`/learn/courses/${c.id}`}>Resume learning</ButtonLink>;
      case 'VIEW_COURSE':
        return c && <ButtonLink size="sm" href={`/courses/${c.slug}`}>View course</ButtonLink>;
      case 'UNLOCK_COURSE':
        return c && <ButtonLink size="sm" variant="amber" href={me ? `/checkout/${c.id}` : signIn(`/checkout/${c.id}`)}>Unlock course</ButtonLink>;
      case 'MARK_COMPLETE':
        return me ? (
          <Button size="sm" loading={mark.isPending && mark.variables?.id === n.id} onClick={() => mark.mutate({ id: n.id, done: false })}>Mark complete</Button>
        ) : (
          <ButtonLink size="sm" href={signIn(typeof window === 'undefined' ? '/' : window.location.pathname)}>Sign in to track it</ButtonLink>
        );
      default:
        return n.state === 'COMPLETED' && !n.course && !n.module && me ? (
          <Button size="sm" variant="tertiary" onClick={() => mark.mutate({ id: n.id, done: true })}>Undo</Button>
        ) : null;
    }
  };
  const selected = r.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {showProgress &&
        (me ? (
          <div style={{ maxWidth: 420, display: 'grid', gap: 6, fontSize: '0.85rem', color: 'var(--ink-2)' }}>
            <Progress value={r.progress.percent} label="Roadmap progress" />
            {r.progress.completed} of {r.progress.total} steps complete
          </div>
        ) : (
          <p style={{ fontSize: '0.88rem', color: 'var(--ink-3)' }}>Sign in to track your progress on this roadmap.</p>
        ))}
      <ul className={rs.legend} aria-label="Legend">
        <li><i className={rs.lCompleted} /> Completed</li>
        <li><i className={rs.lProgress} /> In progress</li>
        <li><i className={rs.lPremium} /> Needs purchase</li>
        <li><i className={rs.lPrereq} /> Needs a prerequisite</li>
        <li><i className={rs.lOptional} /> Branch step (main path is solid)</li>
      </ul>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-3)' }}>Select any step to see what it covers and how to start it.</p>
      <RoadmapGraph nodes={r.nodes} edges={r.edges} selectedId={selectedId} onSelect={(n) => setSelectedId(n.id)} />
      <Dialog open={!!selected} onClose={() => setSelectedId(null)} title={selected?.title ?? ''}>
        {selected && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Pill tone="slate">{selected.type.toLowerCase()}</Pill>
              {selected.isOptional && <Pill>optional</Pill>}
              <Pill tone={selected.state === 'COMPLETED' ? 'forest' : selected.state === 'LOCKED_PREMIUM' ? 'terracotta' : selected.state.startsWith('LOCKED') || selected.state === 'IN_PROGRESS' ? 'amber' : 'neutral'}>
                {STATE_LABEL[selected.state] ?? selected.state}
              </Pill>
            </div>
            {selected.description && <p>{selected.description}</p>}
            {selected.module && <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>Module {selected.module.position} of {r.course?.title ?? 'this course'}</p>}
            {selected.course && (
              <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>
                Course: <strong style={{ color: 'var(--ink-0)' }}>{selected.course.title}</strong> · {duration(selected.course.estimatedMinutes)} · {money(selected.course.approvedPrice, selected.course.currency)}
              </p>
            )}
            {selected.blockingNodeIds.length > 0 && (
              <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>
                Complete first: {selected.blockingNodeIds.map((id) => byId.get(id)?.title).filter(Boolean).join(', ')}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions(selected)}
              {selected.course && selected.action !== 'VIEW_COURSE' && (
                <ButtonLink size="sm" variant="tertiary" href={`/courses/${selected.course.slug}`}>Course details</ButtonLink>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
