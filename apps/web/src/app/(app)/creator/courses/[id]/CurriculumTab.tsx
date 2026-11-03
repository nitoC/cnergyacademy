'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileText, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { del, errorMessage, patch, post, put } from '@/lib/api';
import { ACCESS_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, EmptyState, Pill, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import a from '../../../app.module.scss';
import s from './editor.module.scss';
import type { EditorCourse } from './types';

type Module = EditorCourse['modules'][number];

const ACCESS_OPTIONS = [
  { value: 'FREE', label: 'Free', hint: 'Open to every signed-in learner' },
  { value: 'PREMIUM', label: 'Premium', hint: 'Requires buying the course' },
  { value: 'PREREQUISITE_QUIZ', label: 'Prerequisite quiz', hint: 'Requires passing a chosen quiz' },
  { value: 'PREMIUM_AND_PREREQUISITE_QUIZ', label: 'Premium + prerequisite quiz', hint: 'Requires both' },
];

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const next = [...arr];
  const j = i + dir;
  if (j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function CurriculumTab({ course }: { course: EditorCourse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [moduleDialog, setModuleDialog] = useState<Partial<Module> | null>(null);
  const [lessonFor, setLessonFor] = useState<Module | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [quizFor, setQuizFor] = useState<Module | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['editor', course.id] });
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const disabled = !course.editable;

  const saveModule = useMutation({
    mutationFn: (m: Partial<Module>) => {
      const body = { title: m.title, summary: m.summary ?? undefined, access: m.access, prerequisiteQuizId: m.prerequisiteQuizId || null, isPublished: m.isPublished };
      return m.id ? patch(`/modules/${m.id}`, body) : post(`/courses/${course.id}/modules`, body);
    },
    onSuccess: () => {
      setModuleDialog(null);
      refresh();
      toast('Module saved');
    },
    onError,
  });
  const deleteModule = useMutation({ mutationFn: (id: string) => del(`/modules/${id}`), onSuccess: refresh, onError });
  const reorderModules = useMutation({ mutationFn: (ids: string[]) => put(`/courses/${course.id}/modules/order`, { ids }), onSuccess: refresh, onError });
  const reorderLessons = useMutation({ mutationFn: ({ moduleId, ids }: { moduleId: string; ids: string[] }) => put(`/modules/${moduleId}/lessons/order`, { ids }), onSuccess: refresh, onError });
  const deleteLesson = useMutation({ mutationFn: (id: string) => del(`/lessons/${id}`), onSuccess: refresh, onError });
  const addLesson = useMutation({
    mutationFn: () => post<{ id: string }>(`/modules/${lessonFor!.id}/lessons`, { title: lessonTitle, isPublished: false }),
    onSuccess: (l) => router.push(`/creator/courses/${course.id}/lessons/${l.id}`),
    onError,
  });
  const addQuiz = useMutation({
    mutationFn: () => post<{ id: string }>(`/courses/${course.id}/quizzes`, { title: quizTitle, moduleId: quizFor!.id }),
    onSuccess: (q) => router.push(`/creator/courses/${course.id}/quizzes/${q.id}`),
    onError,
  });

  // Quizzes that may gate a module: any quiz in the course that does not live inside that module.
  const gateOptions = (moduleId?: string) =>
    course.quizzes.filter((q) => q.moduleId !== moduleId).map((q) => ({ value: q.id, label: q.title, hint: q.isPublished ? undefined : 'Not published yet' }));

  return (
    <div className={a.stack}>
      <div className={a.row} style={{ justifyContent: 'space-between' }}>
        <p className={a.muted}>Modules run in order. Each one sets its own access rule — purchase and prerequisite checks are enforced by the server on every lesson and quiz.</p>
        <Button variant="primary" icon={<Plus size={15} />} disabled={disabled} onClick={() => setModuleDialog({ title: '', access: 'FREE', isPublished: true })}>
          Add module
        </Button>
      </div>
      {course.modules.length === 0 && <EmptyState title="No modules yet">Add your first module, then write its lessons.</EmptyState>}
      <ol className={s.modules}>
        {course.modules.map((m, i) => (
          <li key={m.id} className={s.module}>
            <header className={s.moduleHead}>
              <span className={s.moduleNo}>{String(m.position).padStart(2, '0')}</span>
              <div>
                <strong>{m.title}</strong>
                <div className={a.row} style={{ gap: 6, marginTop: 4 }}>
                  <Pill tone={m.access === 'FREE' ? 'forest' : m.access.startsWith('PREMIUM') ? 'terracotta' : 'amber'}>{ACCESS_LABEL[m.access]}</Pill>
                  {m.prerequisiteQuiz && <span className={a.muted}>after “{m.prerequisiteQuiz.title}”</span>}
                  {!m.isPublished && <Pill>Hidden</Pill>}
                </div>
              </div>
              <div className={a.row} style={{ gap: 2 }}>
                <Button size="sm" variant="tertiary" aria-label="Move module up" disabled={disabled || i === 0} onClick={() => reorderModules.mutate(move(course.modules.map((x) => x.id), i, -1))}><ArrowUp size={14} /></Button>
                <Button size="sm" variant="tertiary" aria-label="Move module down" disabled={disabled || i === course.modules.length - 1} onClick={() => reorderModules.mutate(move(course.modules.map((x) => x.id), i, 1))}><ArrowDown size={14} /></Button>
                <Button size="sm" variant="tertiary" aria-label="Edit module" disabled={disabled} onClick={() => setModuleDialog(m)}><Pencil size={14} /></Button>
                <Button size="sm" variant="tertiary" aria-label="Delete module" disabled={disabled} onClick={() => confirm(`Delete “${m.title}” and its lessons?`) && deleteModule.mutate(m.id)}><Trash2 size={14} /></Button>
              </div>
            </header>
            <ul className={s.items}>
              {m.lessons.map((l, li) => (
                <li key={l.id} className={s.item}>
                  <FileText size={14} aria-hidden />
                  <Link href={`/creator/courses/${course.id}/lessons/${l.id}`}>{l.title}</Link>
                  <span className={a.muted}>{l.estimatedMinutes} min{!l.isPublished && ' · draft'}</span>
                  <span className={a.row} style={{ gap: 0 }}>
                    <Button size="sm" variant="tertiary" aria-label="Move lesson up" disabled={disabled || li === 0} onClick={() => reorderLessons.mutate({ moduleId: m.id, ids: move(m.lessons.map((x) => x.id), li, -1) })}><ArrowUp size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Move lesson down" disabled={disabled || li === m.lessons.length - 1} onClick={() => reorderLessons.mutate({ moduleId: m.id, ids: move(m.lessons.map((x) => x.id), li, 1) })}><ArrowDown size={13} /></Button>
                    <Button size="sm" variant="tertiary" aria-label="Delete lesson" disabled={disabled} onClick={() => confirm(`Delete lesson “${l.title}”?`) && deleteLesson.mutate(l.id)}><Trash2 size={13} /></Button>
                  </span>
                </li>
              ))}
              {m.quizzes.map((q) => (
                <li key={q.id} className={s.item}>
                  <ListChecks size={14} aria-hidden color="var(--amber-300)" />
                  <Link href={`/creator/courses/${course.id}/quizzes/${q.id}`}>{q.title}</Link>
                  <span className={a.muted}>
                    {q._count.questions} questions{!q.isPublished && ' · draft'}
                  </span>
                  <span />
                </li>
              ))}
            </ul>
            <footer className={a.row} style={{ gap: 6 }}>
              <Button size="sm" icon={<Plus size={13} />} disabled={disabled} onClick={() => { setLessonFor(m); setLessonTitle(''); }}>Lesson</Button>
              <Button size="sm" icon={<Plus size={13} />} disabled={disabled} onClick={() => { setQuizFor(m); setQuizTitle(`Check: ${m.title}`); }}>Quiz</Button>
            </footer>
          </li>
        ))}
      </ol>

      <Dialog
        open={!!moduleDialog}
        onClose={() => setModuleDialog(null)}
        title={moduleDialog?.id ? 'Edit module' : 'New module'}
        actions={
          <>
            <Button variant="tertiary" onClick={() => setModuleDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={saveModule.isPending} disabled={!moduleDialog?.title?.trim()} onClick={() => moduleDialog && saveModule.mutate(moduleDialog)}>Save module</Button>
          </>
        }
      >
        {moduleDialog && (
          <>
            {saveModule.error && <Callout tone="danger">{errorMessage(saveModule.error)}</Callout>}
            <TextField label="Title" value={moduleDialog.title ?? ''} onChange={(e) => setModuleDialog({ ...moduleDialog, title: e.target.value })} />
            <TextArea label="Summary" rows={2} value={moduleDialog.summary ?? ''} onChange={(e) => setModuleDialog({ ...moduleDialog, summary: e.target.value })} />
            <Select label="Access" value={moduleDialog.access ?? 'FREE'} onChange={(v) => setModuleDialog({ ...moduleDialog, access: v })} options={ACCESS_OPTIONS} />
            {moduleDialog.access?.includes('PREREQUISITE') && (
              <Select
                label="Prerequisite quiz"
                value={moduleDialog.prerequisiteQuizId ?? ''}
                onChange={(v) => setModuleDialog({ ...moduleDialog, prerequisiteQuizId: v })}
                options={gateOptions(moduleDialog.id)}
                placeholder={gateOptions(moduleDialog.id).length ? 'Choose the quiz learners must pass' : 'Create a quiz in an earlier module first'}
                hint="Purchasing never skips this quiz, and passing it never grants premium access."
              />
            )}
            <Checkbox label="Visible to learners" checked={moduleDialog.isPublished ?? true} onChange={(e) => setModuleDialog({ ...moduleDialog, isPublished: e.target.checked })} />
          </>
        )}
      </Dialog>

      <Dialog open={!!lessonFor} onClose={() => setLessonFor(null)} title={`New lesson in “${lessonFor?.title ?? ''}”`} actions={<><Button variant="tertiary" onClick={() => setLessonFor(null)}>Cancel</Button><Button variant="primary" loading={addLesson.isPending} disabled={lessonTitle.trim().length < 2} onClick={() => addLesson.mutate()}>Create and write</Button></>}>
        <TextField label="Lesson title" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} autoFocus />
      </Dialog>
      <Dialog open={!!quizFor} onClose={() => setQuizFor(null)} title={`New quiz in “${quizFor?.title ?? ''}”`} actions={<><Button variant="tertiary" onClick={() => setQuizFor(null)}>Cancel</Button><Button variant="primary" loading={addQuiz.isPending} disabled={quizTitle.trim().length < 2} onClick={() => addQuiz.mutate()}>Create and add questions</Button></>}>
        <TextField label="Quiz title" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} autoFocus />
      </Dialog>
    </div>
  );
}
