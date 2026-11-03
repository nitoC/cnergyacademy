'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, get, patch, post, put } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Panel, Pill, useToast } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Category { id: string; name: string; slug: string; description: string | null; archivedAt: string | null; _count: { courses: number } }
interface Subject { id: string; name: string; slug: string; description: string | null; accentColor: string | null; archivedAt: string | null; categories: Category[]; _count: { courses: number } }
const ACCENTS = ['forest', 'amber', 'terracotta', 'moss', 'slate', 'clay'];

export default function CatalogPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'subjects'], queryFn: () => get<Subject[]>('/admin/subjects') });
  const [subject, setSubject] = useState<Partial<Subject> | null>(null);
  const [category, setCategory] = useState<(Partial<Category> & { subjectId: string }) | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'subjects'] }); qc.invalidateQueries({ queryKey: ['subjects'] }); };
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const saveSubject = useMutation({
    mutationFn: (s: Partial<Subject>) => (s.id ? patch(`/admin/subjects/${s.id}`, { name: s.name, description: s.description, accentColor: s.accentColor }) : post('/admin/subjects', { name: s.name, description: s.description, accentColor: s.accentColor })),
    onSuccess: () => { setSubject(null); refresh(); toast('Subject saved'); },
    onError,
  });
  const archiveSubject = useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => patch(`/admin/subjects/${id}`, { archived }), onSuccess: refresh, onError });
  const saveCategory = useMutation({
    mutationFn: (c: Partial<Category> & { subjectId: string }) => (c.id ? patch(`/admin/categories/${c.id}`, { name: c.name, description: c.description }) : post('/admin/categories', { subjectId: c.subjectId, name: c.name, description: c.description })),
    onSuccess: () => { setCategory(null); refresh(); toast('Category saved'); },
    onError,
  });
  const archiveCategory = useMutation({ mutationFn: ({ id, archived }: { id: string; archived: boolean }) => patch(`/admin/categories/${id}`, { archived }), onSuccess: refresh, onError });
  const reorderSubjects = useMutation({ mutationFn: (ids: string[]) => put('/admin/subjects/order', { ids }), onSuccess: refresh, onError });
  const reorderCategories = useMutation({ mutationFn: ({ subjectId, ids }: { subjectId: string; ids: string[] }) => put(`/admin/subjects/${subjectId}/categories/order`, { ids }), onSuccess: refresh, onError });
  const swap = (ids: string[], i: number, j: number) => { const n = [...ids]; [n[i], n[j]] = [n[j], n[i]]; return n; };

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock />;
  return (
    <div className={a.stack}>
      <PageHead title="Subjects & categories" subtitle="New subjects appear in the catalogue immediately — no code changes required." actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setSubject({ name: '', accentColor: 'forest' })}>New subject</Button>} />
      {q.data.map((s, i) => (
        <Panel key={s.id} style={{ opacity: s.archivedAt ? 0.6 : 1 }}>
          <div className={a.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 className={a.sectionTitle} style={{ marginBottom: 4 }}>{s.name} {s.archivedAt && <Pill>archived</Pill>}</h2>
              <p className={a.muted}>{s.description} · {s._count.courses} courses · accent {s.accentColor}</p>
            </div>
            <span className={a.row} style={{ gap: 2 }}>
              <Button size="sm" variant="tertiary" aria-label="Move subject up" disabled={i === 0} onClick={() => reorderSubjects.mutate(swap(q.data.map((x) => x.id), i, i - 1))}><ArrowUp size={13} /></Button>
              <Button size="sm" variant="tertiary" aria-label="Move subject down" disabled={i === q.data.length - 1} onClick={() => reorderSubjects.mutate(swap(q.data.map((x) => x.id), i, i + 1))}><ArrowDown size={13} /></Button>
              <Button size="sm" onClick={() => setSubject(s)}>Edit</Button>
              <Button size="sm" variant="tertiary" onClick={() => archiveSubject.mutate({ id: s.id, archived: !s.archivedAt })}>{s.archivedAt ? 'Restore' : 'Archive'}</Button>
            </span>
          </div>
          <ul className={a.queue} style={{ marginTop: 12 }}>
            {s.categories.map((c, j) => (
              <li key={c.id} className={a.queueItem} style={{ opacity: c.archivedAt ? 0.55 : 1 }}>
                <span>{c.name} <span className={a.muted}>· {c._count.courses} courses{c.archivedAt ? ' · archived' : ''}</span></span>
                <span className={a.row} style={{ gap: 2 }}>
                  <Button size="sm" variant="tertiary" aria-label="Move up" disabled={j === 0} onClick={() => reorderCategories.mutate({ subjectId: s.id, ids: swap(s.categories.map((x) => x.id), j, j - 1) })}><ArrowUp size={13} /></Button>
                  <Button size="sm" variant="tertiary" aria-label="Move down" disabled={j === s.categories.length - 1} onClick={() => reorderCategories.mutate({ subjectId: s.id, ids: swap(s.categories.map((x) => x.id), j, j + 1) })}><ArrowDown size={13} /></Button>
                  <Button size="sm" variant="tertiary" onClick={() => setCategory({ ...c, subjectId: s.id })}>Edit</Button>
                  <Button size="sm" variant="tertiary" onClick={() => archiveCategory.mutate({ id: c.id, archived: !c.archivedAt })}>{c.archivedAt ? 'Restore' : 'Archive'}</Button>
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" icon={<Plus size={13} />} style={{ marginTop: 10 }} onClick={() => setCategory({ subjectId: s.id, name: '' })}>Category</Button>
        </Panel>
      ))}
      <Dialog open={!!subject} onClose={() => setSubject(null)} title={subject?.id ? 'Edit subject' : 'New subject'} actions={<><Button variant="tertiary" onClick={() => setSubject(null)}>Cancel</Button><Button variant="primary" loading={saveSubject.isPending} disabled={!subject?.name?.trim()} onClick={() => subject && saveSubject.mutate(subject)}>Save</Button></>}>
        {subject && (<>
          {saveSubject.error && <Callout tone="danger">{errorMessage(saveSubject.error)}</Callout>}
          <TextField label="Name" value={subject.name ?? ''} onChange={(e) => setSubject({ ...subject, name: e.target.value })} />
          <TextArea label="Description" rows={2} value={subject.description ?? ''} onChange={(e) => setSubject({ ...subject, description: e.target.value })} />
          <Select label="Accent" value={subject.accentColor ?? 'forest'} onChange={(v) => setSubject({ ...subject, accentColor: v })} options={ACCENTS.map((x) => ({ value: x, label: x }))} hint="Colours generated course covers in this subject" />
        </>)}
      </Dialog>
      <Dialog open={!!category} onClose={() => setCategory(null)} title={category?.id ? 'Edit category' : 'New category'} actions={<><Button variant="tertiary" onClick={() => setCategory(null)}>Cancel</Button><Button variant="primary" loading={saveCategory.isPending} disabled={!category?.name?.trim()} onClick={() => category && saveCategory.mutate(category)}>Save</Button></>}>
        {category && (<>
          {saveCategory.error && <Callout tone="danger">{errorMessage(saveCategory.error)}</Callout>}
          <TextField label="Name" value={category.name ?? ''} onChange={(e) => setCategory({ ...category, name: e.target.value })} />
          <TextArea label="Description" rows={2} value={category.description ?? ''} onChange={(e) => setCategory({ ...category, description: e.target.value })} />
        </>)}
      </Dialog>
    </div>
  );
}
