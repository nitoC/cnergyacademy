'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, get, patch } from '@/lib/api';
import type { Subject } from '@/types/api';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { Button } from '@/components/ui/Button';
import { Callout, Panel, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import a from '../../../app.module.scss';
import type { EditorCourse } from './types';

export function DetailsTab({ course }: { course: EditorCourse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const [f, setF] = useState({
    title: course.title,
    shortDescription: course.shortDescription,
    description: course.description,
    subjectId: course.subjectId,
    categoryId: course.categoryId ?? '',
    difficulty: course.difficulty,
    estimatedMinutes: String(course.estimatedMinutes),
    learningOutcomes: course.learningOutcomes.length ? course.learningOutcomes : [''],
    completionRule: course.completionRule,
    certificateEnabled: course.certificateEnabled,
    thumbnailUrl: course.thumbnailUrl,
  });
  const subject = subjects.data?.find((s) => s.id === f.subjectId);
  const save = useMutation({
    mutationFn: () =>
      patch(`/creator/courses/${course.id}`, {
        ...f,
        categoryId: f.categoryId || null,
        estimatedMinutes: Number(f.estimatedMinutes),
        learningOutcomes: f.learningOutcomes.map((o) => o.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['editor', course.id] });
      toast('Course details saved');
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('purpose', 'course-thumbnail');
      fd.append('file', file);
      return (await api.post<{ url: string }>('/media', fd)).data;
    },
    onSuccess: (r) => setF((x) => ({ ...x, thumbnailUrl: r.url })),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const disabled = !course.editable;

  return (
    <Panel>
      <form className={a.formGrid} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.error && <div className={a.full}><Callout tone="danger">{errorMessage(save.error)}</Callout></div>}
        <div className={a.full}><TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={disabled} /></div>
        <div className={a.full}><TextArea label="Short description" rows={2} value={f.shortDescription} onChange={(e) => setF({ ...f, shortDescription: e.target.value })} disabled={disabled} /></div>
        <div className={a.full}><TextArea label="Full description" rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={disabled} hint="At least 40 characters before you can submit" /></div>
        <Select label="Subject" value={f.subjectId} onChange={(v) => setF({ ...f, subjectId: v, categoryId: '' })} disabled={disabled} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select label="Category" value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} disabled={disabled} options={[{ value: '', label: 'None' }, ...(subject?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Select label="Level" value={f.difficulty} onChange={(v) => setF({ ...f, difficulty: v })} disabled={disabled} options={[{ value: 'BEGINNER', label: 'Beginner' }, { value: 'INTERMEDIATE', label: 'Intermediate' }, { value: 'ADVANCED', label: 'Advanced' }]} />
        <TextField label="Estimated duration (minutes)" type="number" min={5} value={f.estimatedMinutes} onChange={(e) => setF({ ...f, estimatedMinutes: e.target.value })} disabled={disabled} />
        <div className={a.full}>
          <span className={a.muted} style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--ink-1)' }}>Learning outcomes</span>
          <div className={a.stackSm}>
            {f.learningOutcomes.map((o, i) => (
              <div key={i} className={a.row} style={{ flexWrap: 'nowrap' }}>
                <div className={a.grow}><TextField label={`Outcome ${i + 1}`} hideLabel value={o} placeholder="Learners will be able to…" onChange={(e) => setF({ ...f, learningOutcomes: f.learningOutcomes.map((x, j) => (j === i ? e.target.value : x)) })} disabled={disabled} /></div>
                <Button variant="tertiary" size="sm" aria-label={`Remove outcome ${i + 1}`} disabled={disabled} onClick={() => setF({ ...f, learningOutcomes: f.learningOutcomes.filter((_, j) => j !== i) })}><Trash2 size={15} /></Button>
              </div>
            ))}
            <div><Button size="sm" icon={<Plus size={14} />} disabled={disabled || f.learningOutcomes.length >= 12} onClick={() => setF({ ...f, learningOutcomes: [...f.learningOutcomes, ''] })}>Add outcome</Button></div>
          </div>
        </div>
        <Select label="Completion rule" value={f.completionRule} onChange={(v) => setF({ ...f, completionRule: v })} disabled={disabled} options={[{ value: 'ALL_LESSONS_AND_QUIZZES', label: 'All lessons and all quizzes passed' }, { value: 'ALL_LESSONS', label: 'All lessons completed' }]} />
        <div style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <Checkbox label="Issue a certificate on completion" checked={f.certificateEnabled} onChange={(e) => setF({ ...f, certificateEnabled: e.target.checked })} disabled={disabled} />
        </div>
        <div className={a.full}>
          <span style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.82rem' }}>Cover</span>
          <div className={a.row} style={{ alignItems: 'flex-start' }}>
            <div style={{ width: 240, aspectRatio: '16/10', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <CourseCover seed={course.slug} pattern={course.coverPattern} accent={subject?.accentColor} thumbnailUrl={f.thumbnailUrl} />
            </div>
            <div className={a.stackSm}>
              <label className="visually-hidden" htmlFor="thumb">Upload cover image</label>
              <input id="thumb" type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled} onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              <Button size="sm" icon={<Upload size={14} />} loading={upload.isPending} disabled={disabled} onClick={() => document.getElementById('thumb')?.click()}>Upload image</Button>
              {f.thumbnailUrl && <Button size="sm" variant="tertiary" disabled={disabled} onClick={() => setF({ ...f, thumbnailUrl: null })}>Use generated cover</Button>}
              <span className={a.muted}>PNG, JPEG or WebP, up to 5 MB. Without an image, a cover is generated in your subject&apos;s colours.</span>
            </div>
          </div>
        </div>
        <div className={a.full}><Button type="submit" variant="primary" loading={save.isPending} disabled={disabled}>Save details</Button></div>
      </form>
    </Panel>
  );
}
