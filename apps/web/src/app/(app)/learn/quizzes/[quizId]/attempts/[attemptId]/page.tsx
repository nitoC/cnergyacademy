'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Progress } from '@/components/ui/Feedback';
import s from '../../../../learn.module.scss';
import a from '../../../../../app.module.scss';

interface InProgress {
  id: string;
  status: 'IN_PROGRESS';
  attemptNumber: number;
  quiz: { id: string; title: string; allowNavigation: boolean; passingScore: number; courseId: string };
  questions: { id: string; type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'; prompt: string; points: number; options: { id: string; label: string }[] }[];
}
interface Result {
  id: string;
  status: 'SUBMITTED';
  attemptNumber: number;
  scorePercent: number;
  passed: boolean;
  pointsEarned: number;
  pointsTotal: number;
  quiz: { id: string; title: string; passingScore: number; courseId: string };
  feedbackPolicy: 'SCORE_ONLY' | 'SHOW_CORRECTNESS' | 'FULL_EXPLANATIONS';
  unlockedModules: { id: string; title: string }[];
  review: { questionId: string; prompt: string; selectedOptionIds: string[]; isCorrect: boolean; explanation: string | null; options: { id: string; label: string; isCorrect?: boolean }[] }[];
  certificate?: { serial: string } | null;
}

export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attempt', attemptId], queryFn: () => get<InProgress | Result>(`/attempts/${attemptId}`) });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  return q.data.status === 'IN_PROGRESS' ? (
    <Taking attempt={q.data} onDone={(r) => qc.setQueryData(['attempt', attemptId], r)} />
  ) : (
    <ResultView r={q.data} />
  );
}

function Taking({ attempt, onDone }: { attempt: InProgress; onDone: (r: Result) => void }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const total = attempt.questions.length;
  const q = attempt.questions[index];
  const answered = Object.values(answers).filter((v) => v.length).length;
  const submit = useMutation({
    mutationFn: () => post<Result>(`/attempts/${attempt.id}/submit`, { answers: Object.entries(answers).map(([questionId, optionIds]) => ({ questionId, optionIds })) }),
    onSuccess: (r) => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['quiz', attempt.quiz.id] });
      qc.invalidateQueries({ queryKey: ['journey', attempt.quiz.courseId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone(r);
    },
  });
  const toggle = (optionId: string) =>
    setAnswers((prev) => {
      const cur = prev[q.id] ?? [];
      if (q.type === 'SINGLE_CHOICE') return { ...prev, [q.id]: [optionId] };
      return { ...prev, [q.id]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] };
    });
  const canGoTo = (i: number) => attempt.quiz.allowNavigation || i <= index || (answers[attempt.questions[i - 1]?.id]?.length ?? 0) > 0;

  return (
    <div className={s.quizWrap}>
      <div className={a.row} style={{ justifyContent: 'space-between' }}>
        <span className={a.muted}>{attempt.quiz.title} · attempt {attempt.attemptNumber}</span>
        <span className={a.mono}>
          {index + 1} / {total}
        </span>
      </div>
      <Progress value={(answered / total) * 100} label="Questions answered" />
      <nav className={s.dots} aria-label="Questions">
        {attempt.questions.map((qq, i) => (
          <button key={qq.id} type="button" onClick={() => setIndex(i)} disabled={!canGoTo(i)} data-answered={(answers[qq.id]?.length ?? 0) > 0} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${i + 1}`}>
            {i + 1}
          </button>
        ))}
      </nav>
      <fieldset className={s.options}>
        <legend className={s.prompt} style={{ marginBottom: 18 }}>
          {q.prompt}
          {q.type === 'MULTIPLE_CHOICE' && <small style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--ink-3)', marginTop: 6 }}>Select every correct answer</small>}
        </legend>
        {q.options.map((o) => (
          <label key={o.id} className={s.option}>
            <input type={q.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'} name={q.id} checked={answers[q.id]?.includes(o.id) ?? false} onChange={() => toggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <div className={a.row} style={{ justifyContent: 'space-between' }}>
        <Button variant="tertiary" disabled={index === 0 || !attempt.quiz.allowNavigation} onClick={() => setIndex(index - 1)}>
          Previous
        </Button>
        {index < total - 1 ? (
          <Button variant="secondary" disabled={!attempt.quiz.allowNavigation && !(answers[q.id]?.length)} onClick={() => setIndex(index + 1)}>
            Next question
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setConfirm(true)}>
            Submit answers
          </Button>
        )}
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit this attempt?"
        actions={
          <>
            <Button variant="tertiary" onClick={() => setConfirm(false)}>Keep working</Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>Submit</Button>
          </>
        }
      >
        <p>
          You have answered {answered} of {total} questions. Unanswered questions score zero.
        </p>
        {submit.error && <Callout tone="danger">{errorMessage(submit.error)}</Callout>}
      </Dialog>
    </div>
  );
}

function ResultView({ r }: { r: Result }) {
  return (
    <div className={s.quizWrap}>
      <div className={s.scoreHero}>
        <span className={a.muted}>{r.quiz.title} · attempt {r.attemptNumber}</span>
        <strong style={{ color: r.passed ? 'var(--forest-300)' : 'var(--terracotta-300)' }}>{r.scorePercent}%</strong>
        <span>
          {r.passed ? 'Passed' : 'Not passed yet'} · pass mark {r.quiz.passingScore}% · {r.pointsEarned}/{r.pointsTotal} points
        </span>
      </div>
      {r.certificate && <Callout tone="forest">Course complete — certificate {r.certificate.serial} has been issued.</Callout>}
      {r.unlockedModules.length > 0 && <Callout tone="forest">Unlocked: {r.unlockedModules.map((m) => m.title).join(', ')}</Callout>}
      <div className={a.row}>
        <ButtonLink variant="primary" href={`/learn/courses/${r.quiz.courseId}`}>Back to the journey</ButtonLink>
        {!r.passed && <ButtonLink href={`/learn/quizzes/${r.quiz.id}`}>See retry options</ButtonLink>}
      </div>
      {r.review.length > 0 && (
        <section>
          <h2 className={a.sectionTitle}>Review</h2>
          <ol className={s.review}>
            {r.review.map((item, i) => (
              <li key={item.questionId} className={s.reviewItem}>
                <strong style={{ color: 'var(--ink-0)' }}>
                  {i + 1}. {item.prompt} {item.isCorrect ? <Check size={15} color="var(--forest-300)" /> : <X size={15} color="var(--terracotta-300)" />}
                </strong>
                {item.options.map((o) => {
                  const chosen = item.selectedOptionIds.includes(o.id);
                  const cls = o.isCorrect ? s.correct : chosen && o.isCorrect === false ? s.wrong : chosen ? (item.isCorrect ? s.correct : s.wrong) : '';
                  return (
                    <div key={o.id} className={`${s.reviewOpt} ${cls}`}>
                      {chosen ? '●' : '○'} {o.label}
                      {o.isCorrect && <span className={a.muted}> · correct answer</span>}
                    </div>
                  );
                })}
                {item.explanation && <p className={a.muted}>{item.explanation}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
