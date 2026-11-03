'use client';
import { Check, KeyRound, Lock } from 'lucide-react';
import type { CheckpointState, Journey, JourneyCheckpoint } from '@/types/api';
import { smoothPath, type Pt } from '@/lib/geometry';
import s from './journey.module.scss';

type Module = Journey['modules'][number];
export type JourneySelection = { kind: 'module'; module: Module } | { kind: 'checkpoint'; module: Module; checkpoint: JourneyCheckpoint };

interface Stop {
  key: string;
  camp: boolean;
  quiz: boolean;
  state: CheckpointState;
  title: string;
  sub: string;
  select: JourneySelection;
}

const STEP = 92;
const CAMP_STEP = 120;
const W = 1000; // viewBox width; x positions are percentages of this

const STATE_TEXT: Record<CheckpointState, string> = {
  COMPLETED: 'Completed',
  CURRENT: 'Up next',
  AVAILABLE: 'Available',
  UPCOMING: 'Upcoming',
  LOCKED_PREMIUM: 'Premium — unlock the course',
  LOCKED_PREREQUISITE: 'Pass the prerequisite quiz',
  LOCKED: 'Not available',
};

function icon(stop: Stop, index: number) {
  if (stop.state === 'COMPLETED') return <Check size={stop.camp ? 22 : 15} strokeWidth={2.6} />;
  if (stop.state === 'LOCKED_PREMIUM') return <Lock size={stop.camp ? 20 : 13} />;
  if (stop.state === 'LOCKED_PREREQUISITE') return <KeyRound size={stop.camp ? 20 : 13} />;
  if (stop.camp) return <span>{index}</span>;
  return null;
}

/**
 * The course journey: modules are camps, lessons and quizzes are the
 * checkpoints between them. Every state comes from the server's journey
 * endpoint; this component only lays them out along a winding trail.
 */
export function WindingJourney({ journey, onSelect }: { journey: Journey; onSelect: (s: JourneySelection) => void }) {
  const stops: Stop[] = [];
  for (const m of journey.modules) {
    stops.push({
      key: `m-${m.id}`,
      camp: true,
      quiz: false,
      state: m.state,
      title: m.title,
      sub: `Module ${m.position} · ${m.progress.lessonsCompleted}/${m.progress.lessonsTotal} lessons`,
      select: { kind: 'module', module: m },
    });
    for (const c of m.checkpoints) {
      stops.push({
        key: `${c.kind}-${c.id}`,
        camp: false,
        quiz: c.kind === 'quiz',
        state: c.state,
        title: c.title,
        sub:
          c.kind === 'quiz'
            ? `${c.isPrerequisiteGate ? 'Gate quiz' : 'Quiz'} · pass ${c.passingScore}%${c.bestScore != null ? ` · best ${c.bestScore}%` : ''}`
            : `${c.estimatedMinutes} min · ${STATE_TEXT[c.state]}`,
        select: { kind: 'checkpoint', module: m, checkpoint: c },
      });
    }
  }

  // Position each stop on a serpentine: camps swing wide, checkpoints follow.
  let y = 50;
  let phase = 0;
  const pos: Pt[] = stops.map((st, i) => {
    if (i > 0) y += st.camp ? CAMP_STEP : STEP;
    phase += st.camp ? 1.1 : 0.62;
    const amp = st.camp ? 0.3 : 0.24;
    return [W / 2 + Math.sin(phase) * W * amp, y];
  });
  const height = y + 90;
  const trail = smoothPath([[W / 2, 0], ...pos, [W / 2, height]]);
  const lastDone = stops.reduce((acc, st, i) => (st.state === 'COMPLETED' ? i : acc), -1);
  const donePath = lastDone >= 0 ? smoothPath([[W / 2, 0], ...pos.slice(0, lastDone + 1)]) : '';
  let campNo = 0;

  return (
    <div className={s.wrap} style={{ height }} role="list" aria-label={`${journey.course.title} journey`}>
      <svg className={s.svg} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
        <path d={trail} fill="none" style={{ stroke: 'var(--trail-shadow)' }} strokeWidth="16" vectorEffect="non-scaling-stroke" transform="translate(0 5)" />
        <path d={trail} fill="none" style={{ stroke: 'var(--trail-bed)' }} strokeWidth="12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={trail} fill="none" style={{ stroke: 'var(--trail-dash)' }} strokeWidth="1.6" strokeDasharray="2 8" vectorEffect="non-scaling-stroke" />
        {donePath && <path d={donePath} fill="none" style={{ stroke: 'var(--forest-400)' }} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      {stops.map((st, i) => {
        const [x, yy] = pos[i];
        const leftSide = x > W / 2;
        if (st.camp) campNo += 1;
        const isHere = st.state === 'CURRENT' && !st.camp;
        return (
          <div role="listitem" key={st.key}>
            <button
              type="button"
              className={`${s.node} ${st.camp ? s.camp : ''} ${st.quiz ? s.quiz : ''} ${s[`s-${st.state}`]}`}
              style={{ left: `${(x / W) * 100}%`, top: yy }}
              onClick={() => onSelect(st.select)}
              aria-label={`${st.camp ? 'Module' : st.quiz ? 'Quiz' : 'Lesson'}: ${st.title}. ${STATE_TEXT[st.state]}`}
            >
              <span className={s.disc}>{icon(st, campNo)}</span>
              <span className={`${s.label} ${leftSide ? s.left : s.right}`} aria-hidden>
                {isHere && <span className={s.here}>You are here</span>}
                <strong>{st.title}</strong>
                <small>{st.sub}</small>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
