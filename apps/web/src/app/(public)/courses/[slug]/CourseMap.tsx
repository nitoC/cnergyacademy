'use client';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { get } from '@/lib/api';
import { money } from '@/lib/format';
import type { Journey } from '@/types/api';
import { WindingJourney, type JourneySelection } from '@/components/learning/WindingJourney';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Select';
import s from '../../public.module.scss';

/**
 * The full course map, visible before enrolling or paying. Locks come from
 * the same server-side access policy that guards lesson content, so the map
 * shows exactly what a purchase or a checkpoint would open.
 */
export function CourseMap({ courseId, slug, authenticated, list }: { courseId: string; slug: string; authenticated: boolean; list: React.ReactNode }) {
  const router = useRouter();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [prompt, setPrompt] = useState<JourneySelection | null>(null);
  const q = useQuery({ queryKey: ['course-map', courseId, authenticated], queryFn: () => get<Journey>(`/courses/${courseId}/map`), enabled: view === 'map' });

  const select = (sel: JourneySelection) => {
    const state = sel.kind === 'module' ? sel.module.state : sel.checkpoint.state;
    if (!authenticated || state.startsWith('LOCKED')) return setPrompt(sel);
    if (sel.kind === 'checkpoint') router.push(sel.checkpoint.kind === 'lesson' ? `/learn/lessons/${sel.checkpoint.id}` : `/learn/quizzes/${sel.checkpoint.id}`);
    else router.push(`/learn/courses/${courseId}`);
  };
  const m = prompt?.module;
  const next = `/courses/${slug}`;

  return (
    <section aria-labelledby="curriculum">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 id="curriculum" className={s.h2} style={{ margin: 0 }}>Course map</h2>
        <Segmented label="Curriculum view" value={view} onChange={setView} options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List' }]} />
      </div>
      {view === 'list' ? (
        list
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingBlock rows={5} />
      ) : (
        <>
          <p style={{ color: 'var(--ink-3)', fontSize: '0.85rem', marginBottom: 8 }}>
            Every module, lesson and checkpoint in order. Locked steps show what opens them.
          </p>
          <WindingJourney journey={q.data} onSelect={select} />
        </>
      )}
      <Dialog
        open={!!prompt}
        onClose={() => setPrompt(null)}
        title={!authenticated ? 'Sign in to start' : m?.decision.requiresPurchase ? 'Part of the full course' : 'Pass the checkpoint first'}
        actions={
          <>
            <Button variant="tertiary" onClick={() => setPrompt(null)}>Close</Button>
            {!authenticated ? (
              <>
                <ButtonLink href={`/login?next=${encodeURIComponent(next)}`}>Sign in</ButtonLink>
                <ButtonLink variant="primary" href={`/register?next=${encodeURIComponent(next)}`}>Create an account</ButtonLink>
              </>
            ) : (
              <>
                {m?.decision.requiresPrerequisite && m.prerequisiteQuiz && (
                  <ButtonLink href={`/learn/quizzes/${m.prerequisiteQuiz.id}`} icon={<KeyRound size={15} />}>Take the checkpoint</ButtonLink>
                )}
                {m?.decision.requiresPurchase && (
                  <ButtonLink variant="amber" href={`/checkout/${courseId}`} icon={<Lock size={15} />}>
                    Buy · {money(q.data?.course.approvedPrice, q.data?.course.currency)}
                  </ButtonLink>
                )}
              </>
            )}
          </>
        }
      >
        {m && (
          <div style={{ display: 'grid', gap: 8 }}>
            <strong style={{ color: 'var(--ink-0)' }}>
              {prompt?.kind === 'checkpoint' ? prompt.checkpoint.title : m.title}
            </strong>
            <span style={{ color: 'var(--ink-2)', fontSize: '0.9rem' }}>Module {m.position}: {m.title}</span>
            {!authenticated ? (
              <p>Create a free account to open the free lessons and track your progress.{m.decision.requiresPurchase && ' This module is part of the paid course.'}</p>
            ) : (
              <>
                {m.decision.requiresPurchase && <p>This module opens when you buy the course. Free modules stay open either way.</p>}
                {m.decision.requiresPrerequisite && m.prerequisiteQuiz && (
                  <p>Pass “{m.prerequisiteQuiz.title}” to open it.{m.decision.requiresPurchase && ' Buying the course does not skip this checkpoint.'}</p>
                )}
              </>
            )}
          </div>
        )}
      </Dialog>
    </section>
  );
}
