'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { del, errorMessage, get, patch, post, put } from '@/lib/api';
import { useMe } from '@/features/auth/session';
import type { CourseCard, Paginated } from '@/types/api';
import { RoadmapGraph } from '@/components/roadmap/RoadmapGraph';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Panel, Pill, StatusPill, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';

interface Node { id: string; type: string; title: string; description: string | null; courseId: string | null; isOptional: boolean; position: number; level: number; course: { id: string; title: string; status: string } | null }
interface Editor {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  reviewNote: string | null;
  ownerId: string;
  owner: { fullName: string };
  nodes: Node[];
  edges: { id: string; fromNodeId: string; toNodeId: string }[];
  issues: { code: string; message: string }[];
}

export default function RoadmapEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['roadmap-editor', id], queryFn: () => get<Editor>(`/creator/roadmaps/${id}`) });
  const courses = useQuery({ queryKey: ['catalog', 'all'], queryFn: () => get<Paginated<CourseCard>>('/courses', { pageSize: 100, sort: 'title' }) });
  const [node, setNode] = useState<Partial<Node> | null>(null);
  const [edge, setEdge] = useState({ fromNodeId: '', toNodeId: '' });
  const [meta, setMeta] = useState<{ title: string; summary: string } | null>(null);
  const [rejectNote, setRejectNote] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['roadmap-editor', id] });
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  const saveNode = useMutation({
    mutationFn: (n: Partial<Node>) => {
      const body = { type: n.type, title: n.title, description: n.description || undefined, courseId: n.type === 'COURSE' ? n.courseId : null, isOptional: n.isOptional ?? false };
      return n.id ? patch(`/creator/roadmap-nodes/${n.id}`, body) : post(`/creator/roadmaps/${id}/nodes`, body);
    },
    onSuccess: () => { setNode(null); refresh(); },
    onError,
  });
  const deleteNode = useMutation({ mutationFn: (nid: string) => del(`/creator/roadmap-nodes/${nid}`), onSuccess: refresh, onError });
  const addEdge = useMutation({ mutationFn: () => post(`/creator/roadmaps/${id}/edges`, edge), onSuccess: () => { setEdge({ fromNodeId: '', toNodeId: '' }); refresh(); }, onError });
  const deleteEdge = useMutation({ mutationFn: (eid: string) => del(`/creator/roadmap-edges/${eid}`), onSuccess: refresh, onError });
  const reorder = useMutation({ mutationFn: (ids: string[]) => put(`/creator/roadmaps/${id}/nodes/order`, { ids }), onSuccess: refresh, onError });
  const saveMeta = useMutation({ mutationFn: () => patch(`/creator/roadmaps/${id}`, meta), onSuccess: () => { setMeta(null); refresh(); }, onError });
  const decide = useMutation({
    mutationFn: ({ action, note }: { action: string; note?: string }) => post(`/roadmaps/${id}/decisions`, { action, note }),
    onSuccess: () => { setRejectNote(null); refresh(); qc.invalidateQueries({ queryKey: ['admin', 'roadmaps'] }); toast('Roadmap updated'); },
    onError,
  });
  const remove = useMutation({ mutationFn: () => del(`/creator/roadmaps/${id}`), onSuccess: () => router.push('/creator/roadmaps'), onError });

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const r = q.data;
  const isOwner = me?.id === r.ownerId;
  const isReviewer = !!me?.permissions.includes('roadmaps.publish');
  const locked = r.status === 'SUBMITTED' && !isReviewer;
  const nodeOptions = r.nodes.map((n) => ({ value: n.id, label: n.title }));
  const titleOf = (nid: string) => r.nodes.find((n) => n.id === nid)?.title ?? '?';

  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: isReviewer && !isOwner ? '/admin/roadmaps' : '/creator/roadmaps', label: 'Roadmaps' }]}
        title={r.title}
        subtitle={<span className={a.row}><StatusPill status={r.status} /> by {r.owner.fullName}</span>}
        actions={
          <>
            <ButtonLink href={`/roadmaps/${r.slug}`} icon={<Eye size={15} />}>Preview</ButtonLink>
            {isOwner && r.status === 'DRAFT' && !isReviewer && <Button variant="primary" loading={decide.isPending} disabled={r.issues.length > 0} onClick={() => decide.mutate({ action: 'submit' })}>Submit for review</Button>}
            {isReviewer && (r.status === 'SUBMITTED' || (isOwner && r.status === 'DRAFT')) && <Button variant="primary" loading={decide.isPending} disabled={r.issues.length > 0} onClick={() => decide.mutate({ action: 'publish' })}>Publish</Button>}
            {isReviewer && r.status === 'SUBMITTED' && <Button onClick={() => setRejectNote('')}>Return for changes</Button>}
            {isReviewer && r.status === 'PUBLISHED' && <Button onClick={() => decide.mutate({ action: 'unpublish' })}>Unpublish</Button>}
            {(r.status === 'DRAFT' || r.status === 'PUBLISHED') && <Button variant="tertiary" onClick={() => confirm('Archive this roadmap?') && decide.mutate({ action: 'archive' })}>Archive</Button>}
            {r.status !== 'PUBLISHED' && <Button variant="tertiary" aria-label="Delete roadmap" onClick={() => confirm('Delete this roadmap?') && remove.mutate()}><Trash2 size={15} /></Button>}
          </>
        }
      />
      {r.reviewNote && <Callout>Reviewer note: {r.reviewNote}</Callout>}
      {locked && <Callout>Under review — editing is paused until an administrator decides.</Callout>}
      {r.issues.length > 0 ? (
        <Callout tone="danger">Before it can be published: {r.issues.map((i) => i.message).join(' · ')}</Callout>
      ) : (
        <Callout tone="forest">Structure is valid: no loops, every course step points to a published course.</Callout>
      )}

      <div className={a.split}>
        <div className={a.stack}>
          <section>
            <div className={a.row} style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 className={a.sectionTitle} style={{ margin: 0 }}>Steps</h2>
              <Button size="sm" variant="primary" icon={<Plus size={14} />} disabled={locked} onClick={() => setNode({ type: 'COURSE', title: '', isOptional: false })}>Add step</Button>
            </div>
            <ul className={a.queue}>
              {r.nodes.map((n, i) => (
                <li key={n.id} className={a.queueItem}>
                  <div>
                    <span style={{ color: 'var(--ink-0)' }}>{n.title}</span>{' '}
                    <Pill>{n.type.toLowerCase()}</Pill> {n.isOptional && <Pill tone="slate">optional</Pill>}
                    {n.course && <div className={a.muted}>Course: {n.course.title} {n.course.status !== 'PUBLISHED' && `(${n.course.status.toLowerCase()})`}</div>}
                  </div>
                  <span className={a.row} style={{ gap: 0 }}>
                    <Button size="sm" variant="tertiary" aria-label="Move up" disabled={locked || i === 0} onClick={() => { const ids = r.nodes.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; reorder.mutate(ids); }}><ArrowUp size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Move down" disabled={locked || i === r.nodes.length - 1} onClick={() => { const ids = r.nodes.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; reorder.mutate(ids); }}><ArrowDown size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Edit step" disabled={locked} onClick={() => setNode(n)}><Pencil size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Delete step" disabled={locked} onClick={() => confirm(`Delete “${n.title}”?`) && deleteNode.mutate(n.id)}><Trash2 size={13} /></Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className={a.sectionTitle}>Preview</h2>
            {r.nodes.length ? <RoadmapGraph nodes={r.nodes} edges={r.edges} /> : <p className={a.muted}>Add steps to see the map.</p>}
          </section>
        </div>
        <aside className={a.stack}>
          <Panel>
            <h2 className={a.sectionTitle}>Prerequisites</h2>
            <p className={a.muted} style={{ marginBottom: 12 }}>“A before B” means learners must complete A first. Loops are rejected.</p>
            <div className={a.stackSm}>
              <Select label="Complete first" value={edge.fromNodeId} onChange={(v) => setEdge({ ...edge, fromNodeId: v })} options={nodeOptions} disabled={locked} />
              <Select label="Then unlock" value={edge.toNodeId} onChange={(v) => setEdge({ ...edge, toNodeId: v })} options={nodeOptions.filter((o) => o.value !== edge.fromNodeId)} disabled={locked} />
              <Button size="sm" loading={addEdge.isPending} disabled={locked || !edge.fromNodeId || !edge.toNodeId} onClick={() => addEdge.mutate()}>Connect</Button>
            </div>
            <ul className={a.queue} style={{ marginTop: 14 }}>
              {r.edges.map((e) => (
                <li key={e.id} className={a.queueItem}>
                  <span style={{ fontSize: '0.85rem' }}>{titleOf(e.fromNodeId)} → {titleOf(e.toNodeId)}</span>
                  <Button size="sm" variant="tertiary" aria-label="Remove connection" disabled={locked} onClick={() => deleteEdge.mutate(e.id)}><X size={13} /></Button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h2 className={a.sectionTitle}>Details</h2>
            {meta ? (
              <div className={a.stackSm}>
                <TextField label="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
                <TextArea label="Summary" value={meta.summary} onChange={(e) => setMeta({ ...meta, summary: e.target.value })} />
                <div className={a.row}><Button size="sm" variant="primary" loading={saveMeta.isPending} onClick={() => saveMeta.mutate()}>Save</Button><Button size="sm" variant="tertiary" onClick={() => setMeta(null)}>Cancel</Button></div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem' }}>{r.summary}</p>
                <Button size="sm" variant="tertiary" disabled={locked} onClick={() => setMeta({ title: r.title, summary: r.summary })}>Edit details</Button>
              </>
            )}
          </Panel>
        </aside>
      </div>

      <Dialog open={!!node} onClose={() => setNode(null)} title={node?.id ? 'Edit step' : 'New step'} actions={<><Button variant="tertiary" onClick={() => setNode(null)}>Cancel</Button><Button variant="primary" loading={saveNode.isPending} disabled={!node?.title?.trim() || (node?.type === 'COURSE' && !node.courseId)} onClick={() => node && saveNode.mutate(node)}>Save step</Button></>}>
        {node && (
          <>
            <Select label="Type" value={node.type ?? 'COURSE'} onChange={(v) => setNode({ ...node, type: v })} options={[{ value: 'COURSE', label: 'Course' }, { value: 'TOPIC', label: 'Topic' }, { value: 'ACTIVITY', label: 'Activity' }, { value: 'MILESTONE', label: 'Milestone' }]} />
            {node.type === 'COURSE' && (
              <Select
                label="Course"
                value={node.courseId ?? ''}
                onChange={(v) => setNode({ ...node, courseId: v, title: node.title || courses.data?.items.find((c) => c.id === v)?.title || '' })}
                options={(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))}
                hint="Only published courses are listed"
              />
            )}
            <TextField label="Title" value={node.title ?? ''} onChange={(e) => setNode({ ...node, title: e.target.value })} />
            <TextArea label="Description" rows={2} value={node.description ?? ''} onChange={(e) => setNode({ ...node, description: e.target.value })} />
            <Checkbox label="Optional — does not block later steps" checked={node.isOptional ?? false} onChange={(e) => setNode({ ...node, isOptional: e.target.checked })} />
          </>
        )}
      </Dialog>
      <Dialog open={rejectNote !== null} onClose={() => setRejectNote(null)} title="Return for changes" actions={<><Button variant="tertiary" onClick={() => setRejectNote(null)}>Cancel</Button><Button variant="danger" disabled={!rejectNote?.trim()} loading={decide.isPending} onClick={() => decide.mutate({ action: 'reject', note: rejectNote ?? '' })}>Return</Button></>}>
        <TextArea label="What needs to change?" value={rejectNote ?? ''} onChange={(e) => setRejectNote(e.target.value)} />
      </Dialog>
    </div>
  );
}
