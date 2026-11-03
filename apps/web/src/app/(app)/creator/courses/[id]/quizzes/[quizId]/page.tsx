'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { del, errorMessage, get, patch, post, put } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../../../../PageHead';
import a from '../../../../../app.module.scss';
import s from '../../editor.module.scss';

interface Option { id?: string; label: string; isCorrect: boolean }
interface Question { id: string; type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'; prompt: string; explanation: string | null; points: number; options: Option[] }
interface EditorQuiz {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number | null;
  cooldownMinutes: number;
  allowNavigation: boolean;
  shuffleQuestions: boolean;
  feedbackPolicy: string;
  isPublished: boolean;
  course: { id: string; title: string };
  module: { id: string; title: string } | null;
  gatesModules: { id: string; title: string }[];
  questions: Question[];
  stats: { attempts: number; averageScore: number | null; passes: number };
}

function QuestionForm({ initial, onSave, onCancel, saving }: { initial: Omit<Question, 'id'> & { id?: string }; onSave: (q: Omit<Question, 'id'>) => void; onCancel?: () => void; saving: boolean }) {
  const [q, setQ] = useState(initial);
  const setOpt = (i: number, o: Partial<Option>) =>
    setQ((x) => ({ ...x, options: x.options.map((y, j) => (j === i ? { ...y, ...o } : q.type === 'SINGLE_CHOICE' && o.isCorrect ? { ...y, isCorrect: false } : y)) }));
  return (
    <div className={s.question}>
      <TextArea label="Question" rows={2} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} />
      <div className={a.formGrid}>
        <Select label="Type" value={q.type} onChange={(v) => setQ({ ...q, type: v })} options={[{ value: 'SINGLE_CHOICE', label: 'Single answer' }, { value: 'MULTIPLE_CHOICE', label: 'Multiple answers' }]} />
        <TextField label="Points" type="number" min={1} max={100} value={q.points} onChange={(e) => setQ({ ...q, points: Number(e.target.value) })} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Options — tick the correct {q.type === 'SINGLE_CHOICE' ? 'answer' : 'answers'}</span>
      {q.options.map((o, i) => (
        <div key={i} className={s.optRow}>
          <input type={q.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'} aria-label={`Option ${i + 1} is correct`} checked={o.isCorrect} onChange={(e) => setOpt(i, { isCorrect: e.target.checked })} style={{ accentColor: 'var(--forest-500)', width: 16, height: 16 }} />
          <TextField label={`Option ${i + 1}`} hideLabel value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder={`Option ${i + 1}`} />
          <Button size="sm" variant="tertiary" aria-label={`Remove option ${i + 1}`} disabled={q.options.length <= 2} onClick={() => setQ({ ...q, options: q.options.filter((_, j) => j !== i) })}><Trash2 size={13} /></Button>
        </div>
      ))}
      <div><Button size="sm" icon={<Plus size={13} />} disabled={q.options.length >= 10} onClick={() => setQ({ ...q, options: [...q.options, { label: '', isCorrect: false }] })}>Option</Button></div>
      <TextArea label="Explanation (shown after submission)" rows={2} value={q.explanation ?? ''} onChange={(e) => setQ({ ...q, explanation: e.target.value })} />
      <div className={a.row}>
        <Button variant="primary" size="sm" loading={saving} onClick={() => onSave({ type: q.type, prompt: q.prompt, explanation: q.explanation || null, points: q.points, options: q.options.map(({ label, isCorrect }) => ({ label, isCorrect })) })}>Save question</Button>
        {onCancel && <Button size="sm" variant="tertiary" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

export default function QuizEditor() {
  const { id: courseId, quizId } = useParams<{ id: string; quizId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['quiz-editor', quizId], queryFn: () => get<EditorQuiz>(`/creator/quizzes/${quizId}`) });
  const [settings, setSettings] = useState<Partial<EditorQuiz>>({});
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [seen, setSeen] = useState<EditorQuiz | undefined>();
  if (q.data && q.data !== seen) {
    setSeen(q.data);
    setSettings({ title: q.data.title, description: q.data.description, passingScore: q.data.passingScore, maxAttempts: q.data.maxAttempts, cooldownMinutes: q.data.cooldownMinutes, allowNavigation: q.data.allowNavigation, shuffleQuestions: q.data.shuffleQuestions, feedbackPolicy: q.data.feedbackPolicy });
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['quiz-editor', quizId] });
    qc.invalidateQueries({ queryKey: ['editor', courseId] });
  };
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const saveSettings = useMutation({ mutationFn: (body: object) => patch(`/quizzes/${quizId}`, body), onSuccess: () => { refresh(); toast('Quiz saved'); }, onError });
  const saveQuestion = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: object }) => (id ? put(`/questions/${id}`, body) : post(`/quizzes/${quizId}/questions`, body)),
    onSuccess: () => { setEditing(null); refresh(); },
    onError,
  });
  const removeQuestion = useMutation({ mutationFn: (id: string) => del(`/questions/${id}`), onSuccess: refresh, onError });
  const removeQuiz = useMutation({ mutationFn: () => del(`/quizzes/${quizId}`), onSuccess: () => router.push(`/creator/courses/${courseId}?tab=curriculum`), onError });

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const z = q.data;

  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: `/creator/courses/${courseId}?tab=curriculum`, label: z.course.title }]}
        title={z.title}
        subtitle={<span className={a.row}><StatusPill status={z.isPublished ? 'PUBLISHED' : 'DRAFT'} /> {z.module ? `In ${z.module.title}` : 'Course-level quiz'}{z.gatesModules.length > 0 && ` · gates ${z.gatesModules.map((m) => m.title).join(', ')}`}</span>}
        actions={
          <>
            <Button variant={z.isPublished ? 'secondary' : 'primary'} loading={saveSettings.isPending} onClick={() => saveSettings.mutate({ isPublished: !z.isPublished })}>{z.isPublished ? 'Unpublish' : 'Publish quiz'}</Button>
            <Button variant="tertiary" onClick={() => confirm('Delete this quiz?') && removeQuiz.mutate()}>Delete</Button>
          </>
        }
      />
      <div className={a.split}>
        <div className={a.stack}>
          <h2 className={a.sectionTitle}>Questions ({z.questions.length})</h2>
          {z.questions.map((qq, i) =>
            editing === qq.id ? (
              <QuestionForm key={qq.id} initial={qq} saving={saveQuestion.isPending} onCancel={() => setEditing(null)} onSave={(body) => saveQuestion.mutate({ id: qq.id, body })} />
            ) : (
              <div key={qq.id} className={s.question}>
                <div className={s.blockHead}>
                  <span>Question {i + 1} · {qq.points} pt · {qq.type === 'SINGLE_CHOICE' ? 'single' : 'multiple'}</span>
                  <div className={a.row} style={{ gap: 0 }}>
                    <Button size="sm" variant="tertiary" onClick={() => setEditing(qq.id)}>Edit</Button>
                    <Button size="sm" variant="tertiary" disabled={i === 0} onClick={() => { const ids = z.questions.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; put(`/quizzes/${quizId}/questions/order`, { ids }).then(refresh, onError); }}>Up</Button>
                    <Button size="sm" variant="tertiary" aria-label="Delete question" onClick={() => confirm('Delete this question?') && removeQuestion.mutate(qq.id)}><Trash2 size={13} /></Button>
                  </div>
                </div>
                <strong style={{ color: 'var(--ink-0)' }}>{qq.prompt}</strong>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
                  {qq.options.map((o) => <li key={o.id} style={{ color: o.isCorrect ? 'var(--forest-300)' : undefined }}>{o.label}{o.isCorrect && ' ✓'}</li>)}
                </ul>
              </div>
            ),
          )}
          {editing === 'new' ? (
            <QuestionForm initial={{ type: 'SINGLE_CHOICE', prompt: '', explanation: '', points: 1, options: [{ label: '', isCorrect: true }, { label: '', isCorrect: false }, { label: '', isCorrect: false }] }} saving={saveQuestion.isPending} onCancel={() => setEditing(null)} onSave={(body) => saveQuestion.mutate({ body })} />
          ) : (
            <div><Button icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add question</Button></div>
          )}
        </div>
        <aside className={a.stack}>
          <Panel>
            <form className={a.stackSm} onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(settings); }}>
              <h2 className={a.sectionTitle}>Settings</h2>
              {!!saveSettings.error && <Callout tone="danger">{errorMessage(saveSettings.error)}</Callout>}
              <TextField label="Title" value={settings.title ?? ''} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
              <TextField label="Pass mark (%)" type="number" min={1} max={100} value={settings.passingScore ?? 70} onChange={(e) => setSettings({ ...settings, passingScore: Number(e.target.value) })} />
              <TextField label="Maximum attempts" type="number" min={1} max={100} value={settings.maxAttempts ?? ''} placeholder="Unlimited" onChange={(e) => setSettings({ ...settings, maxAttempts: e.target.value ? Number(e.target.value) : null })} />
              <TextField label="Wait between attempts (minutes)" type="number" min={0} value={settings.cooldownMinutes ?? 0} onChange={(e) => setSettings({ ...settings, cooldownMinutes: Number(e.target.value) })} />
              <Select label="After submission show" value={settings.feedbackPolicy ?? 'FULL_EXPLANATIONS'} onChange={(v) => setSettings({ ...settings, feedbackPolicy: v })} options={[{ value: 'SCORE_ONLY', label: 'Score only' }, { value: 'SHOW_CORRECTNESS', label: 'Which answers were right or wrong' }, { value: 'FULL_EXPLANATIONS', label: 'Correct answers and explanations' }]} />
              <Checkbox label="Learners can move between questions" checked={settings.allowNavigation ?? true} onChange={(e) => setSettings({ ...settings, allowNavigation: e.target.checked })} />
              <Checkbox label="Shuffle question order" checked={settings.shuffleQuestions ?? false} onChange={(e) => setSettings({ ...settings, shuffleQuestions: e.target.checked })} />
              <Button type="submit" loading={saveSettings.isPending}>Save settings</Button>
            </form>
          </Panel>
          <dl className={a.dl} style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Attempts</dt><dd>{z.stats.attempts}</dd>
            <dt>Average</dt><dd>{z.stats.averageScore === null ? '—' : `${Math.round(z.stats.averageScore)}%`}</dd>
            <dt>Learners passed</dt><dd>{z.stats.passes}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
