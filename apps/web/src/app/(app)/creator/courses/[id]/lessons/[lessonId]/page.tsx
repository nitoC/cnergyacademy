'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage, get, patch } from '@/lib/api';
import type { LessonBlock } from '@/types/api';
import { LessonRenderer } from '@/components/learning/LessonRenderer';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../../../../PageHead';
import a from '../../../../../app.module.scss';
import s from '../../editor.module.scss';

interface EditorLesson { id: string; title: string; summary: string | null; content: LessonBlock[]; estimatedMinutes: number; isPublished: boolean; module: { id: string; title: string; courseId: string } }

const TEMPLATES: Record<LessonBlock['type'], LessonBlock> = {
  heading: { type: 'heading', level: 2, text: '' },
  paragraph: { type: 'paragraph', text: '' },
  list: { type: 'list', style: 'bullet', items: [''] },
  code: { type: 'code', language: 'ts', code: '' },
  callout: { type: 'callout', tone: 'note', text: '' },
  image: { type: 'image', url: '', alt: '' },
  resource: { type: 'resource', title: '', url: '' },
};
const LABEL: Record<LessonBlock['type'], string> = { heading: 'Heading', paragraph: 'Paragraph', list: 'List', code: 'Code', callout: 'Callout', image: 'Image', resource: 'Resource link' };

function BlockFields({ block, onChange, onUpload }: { block: LessonBlock; onChange: (b: LessonBlock) => void; onUpload: (f: File) => Promise<string> }) {
  switch (block.type) {
    case 'heading':
      return (
        <div className={a.formGrid}>
          <TextField label="Heading" value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          <Select label="Level" value={String(block.level) as '2' | '3'} onChange={(v) => onChange({ ...block, level: Number(v) as 2 | 3 })} options={[{ value: '2', label: 'Section' }, { value: '3', label: 'Sub-section' }]} />
        </div>
      );
    case 'paragraph':
      return <TextArea label="Paragraph" value={block.text} rows={4} onChange={(e) => onChange({ ...block, text: e.target.value })} hint="Inline: **bold**, *italic*, `code`, [label](https://link)" />;
    case 'list':
      return (
        <>
          <Select label="Style" value={block.style} onChange={(v) => onChange({ ...block, style: v })} options={[{ value: 'bullet', label: 'Bulleted' }, { value: 'number', label: 'Numbered' }]} />
          <TextArea label="Items (one per line)" rows={4} value={block.items.join('\n')} onChange={(e) => onChange({ ...block, items: e.target.value.split('\n') })} />
        </>
      );
    case 'code':
      return (
        <>
          <TextField label="Language" value={block.language} onChange={(e) => onChange({ ...block, language: e.target.value })} />
          <TextArea label="Code" rows={6} value={block.code} onChange={(e) => onChange({ ...block, code: e.target.value })} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
        </>
      );
    case 'callout':
      return (
        <>
          <div className={a.formGrid}>
            <Select label="Tone" value={block.tone} onChange={(v) => onChange({ ...block, tone: v })} options={[{ value: 'note', label: 'Note' }, { value: 'tip', label: 'Tip' }, { value: 'warning', label: 'Warning' }]} />
            <TextField label="Title (optional)" value={block.title ?? ''} onChange={(e) => onChange({ ...block, title: e.target.value || undefined })} />
          </div>
          <TextArea label="Text" rows={3} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </>
      );
    case 'image':
      return (
        <>
          <div className={a.row}>
            <div className={a.grow}><TextField label="Image URL" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://… or upload" /></div>
            <label style={{ alignSelf: 'end' }}>
              <span className="visually-hidden">Upload image</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange({ ...block, url: await onUpload(f) }); }} />
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', color: 'var(--amber-300)', fontSize: '0.85rem', paddingBottom: 10 }}><ImagePlus size={15} /> Upload</span>
            </label>
          </div>
          <TextField label="Alt text" value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} hint="Describe the image for screen-reader users" />
          <TextField label="Caption (optional)" value={block.caption ?? ''} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />
        </>
      );
    case 'resource':
      return (
        <>
          <div className={a.formGrid}>
            <TextField label="Title" value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
            <TextField label="URL" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://" />
          </div>
          <TextField label="Description (optional)" value={block.description ?? ''} onChange={(e) => onChange({ ...block, description: e.target.value || undefined })} />
        </>
      );
  }
}

export default function LessonEditor() {
  const { id: courseId, lessonId } = useParams<{ id: string; lessonId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['lesson-editor', lessonId], queryFn: () => get<EditorLesson>(`/creator/lessons/${lessonId}`) });
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('10');
  const [published, setPublished] = useState(false);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [seen, setSeen] = useState<EditorLesson | undefined>();
  if (q.data && q.data !== seen) {
    setSeen(q.data);
    setTitle(q.data.title);
    setSummary(q.data.summary ?? '');
    setMinutes(String(q.data.estimatedMinutes));
    setPublished(q.data.isPublished);
    setBlocks(q.data.content);
    setDirty(false);
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = useMutation({
    mutationFn: () => patch(`/lessons/${lessonId}`, { title, summary: summary || undefined, estimatedMinutes: Number(minutes), isPublished: published, content: blocks }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['lesson-editor', lessonId] });
      qc.invalidateQueries({ queryKey: ['editor', courseId] });
      toast('Lesson saved');
    },
  });
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('purpose', 'lesson-image');
    fd.append('file', file);
    try {
      return (await api.post<{ url: string }>('/media', fd)).data.url;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return '';
    }
  };
  const update = (fn: (b: LessonBlock[]) => LessonBlock[]) => {
    setBlocks(fn);
    setDirty(true);
  };

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock rows={8} />;

  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: `/creator/courses/${courseId}?tab=curriculum`, label: q.data.module.title }]}
        title={title || 'Untitled lesson'}
        actions={<Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{dirty ? 'Save changes' : 'Saved'}</Button>}
      />
      {save.error && <Callout tone="danger">{errorMessage(save.error)}</Callout>}
      <div className={s.blockEditor}>
        <div className={a.stack}>
          <div className={a.formGrid}>
            <div className={a.full}><TextField label="Title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></div>
            <div className={a.full}><TextField label="Summary" value={summary} onChange={(e) => { setSummary(e.target.value); setDirty(true); }} /></div>
            <TextField label="Reading time (minutes)" type="number" min={1} value={minutes} onChange={(e) => { setMinutes(e.target.value); setDirty(true); }} />
            <div style={{ alignSelf: 'end', paddingBottom: 10 }}><Checkbox label="Published to learners" checked={published} onChange={(e) => { setPublished(e.target.checked); setDirty(true); }} /></div>
          </div>
          <div className={s.blocks}>
            {blocks.map((b, i) => (
              <section key={i} className={s.block} aria-label={`${LABEL[b.type]} block`}>
                <div className={s.blockHead}>
                  <span>{LABEL[b.type]}</span>
                  <div className={a.row} style={{ gap: 0 }}>
                    <Button size="sm" variant="tertiary" aria-label="Move up" disabled={i === 0} onClick={() => update((x) => { const n = [...x]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><ArrowUp size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => update((x) => { const n = [...x]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><ArrowDown size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Remove block" onClick={() => update((x) => x.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
                  </div>
                </div>
                <BlockFields block={b} onUpload={upload} onChange={(nb) => update((x) => x.map((y, j) => (j === i ? nb : y)))} />
              </section>
            ))}
            <div className={s.addBar} role="group" aria-label="Add a block">
              {(Object.keys(TEMPLATES) as LessonBlock['type'][]).map((t) => (
                <Button key={t} size="sm" onClick={() => update((x) => [...x, structuredClone(TEMPLATES[t])])}>+ {LABEL[t]}</Button>
              ))}
            </div>
          </div>
        </div>
        <aside className={s.preview} aria-label="Preview">
          <span className={a.muted} style={{ display: 'block', marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.12em' }}>PREVIEW</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '2rem', marginBottom: 20 }}>{title}</h1>
          <LessonRenderer blocks={blocks.filter((b) => (b.type === 'image' ? !!b.url : true))} />
        </aside>
      </div>
    </div>
  );
}
