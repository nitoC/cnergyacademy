'use client';
import { Check, KeyRound, Lock } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import s from './roadmap.module.scss';

export interface GraphNodeView {
  id: string;
  type: string;
  title: string;
  level: number;
  position: number;
  isOptional?: boolean;
  state?: string;
}
export interface GraphEdgeView {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

type Side = 'left' | 'center' | 'right';
interface Placed<N> {
  node: N;
  side: Side;
}

export const STATE_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  AVAILABLE: 'Available now',
  LOCKED_PREMIUM: 'Premium course',
  LOCKED_PREREQUISITE: 'Complete the prerequisite first',
  UPCOMING: 'Upcoming',
};

/**
 * Splits each prerequisite level into one "spine" step (centre column) and
 * branch steps alternating right and left. The spine prefers the step that
 * continues from the previous spine step, then course and milestone steps.
 */
export function layoutRoadmap<N extends GraphNodeView>(nodes: N[], edges: GraphEdgeView[]): Placed<N>[][] {
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const rows: Placed<N>[][] = [];
  let prevSpine: string | null = null;
  // Branch sides alternate across the whole map (not per row), so connectors
  // in consecutive rows fan out to opposite sides instead of crossing.
  let flip = 0;
  for (const level of levels) {
    const row = nodes.filter((n) => n.level === level).sort((a, b) => a.position - b.position);
    const score = (n: N) =>
      (prevSpine && edges.some((e) => e.fromNodeId === prevSpine && e.toNodeId === n.id) ? 4 : 0) +
      (n.type === 'COURSE' || n.type === 'MILESTONE' ? 2 : 0) +
      (n.isOptional ? -3 : 0);
    const spine = [...row].sort((a, b) => score(b) - score(a) || a.position - b.position)[0];
    prevSpine = spine.id;
    rows.push(row.map((node) => ({ node, side: node === spine ? 'center' : flip++ % 2 === 0 ? 'right' : 'left' })));
  }
  return rows;
}

function Badge({ state }: { state?: string }) {
  if (!state || state === 'AVAILABLE') return null;
  const icon =
    state === 'COMPLETED' ? <Check size={11} strokeWidth={3} /> : state === 'LOCKED_PREMIUM' ? <Lock size={10} strokeWidth={2.5} /> : state === 'LOCKED_PREREQUISITE' ? <KeyRound size={10} strokeWidth={2.5} /> : null;
  return (
    <span className={`${s.badge} ${s[`b-${state}`]}`} aria-hidden>
      {icon}
    </span>
  );
}

/**
 * Roadmap in the familiar "spine and branches" form: the main path runs down
 * the centre with solid connectors; branch steps sit beside it joined by
 * dotted connectors. Rows are laid out in normal document flow, so cards can
 * never overlap; connectors are measured from the rendered boxes.
 */
export function RoadmapGraph<N extends GraphNodeView>({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: N[];
  edges: GraphEdgeView[];
  selectedId?: string | null;
  onSelect?: (node: N) => void;
}) {
  const rows = useMemo(() => layoutRoadmap(nodes, edges), [nodes, edges]);
  const sideOf = useMemo(() => new Map(rows.flat().map((p) => [p.node.id, p.side])), [rows]);
  const ref = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ id: string; d: string; spine: boolean; done: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const rect = (id: string) => {
        const n = el.querySelector<HTMLElement>(`[data-node="${id}"]`);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2 };
      };
      const out = edges.flatMap((e) => {
        const a = rect(e.fromNodeId);
        const b = rect(e.toNodeId);
        if (!a || !b) return [];
        const fromSide = sideOf.get(e.fromNodeId);
        const toSide = sideOf.get(e.toNodeId);
        const done = nodes.find((n) => n.id === e.fromNodeId)?.state === 'COMPLETED';
        // Spine: straight drop between centre boxes.
        if (fromSide === 'center' && toSide === 'center') {
          return [{ id: e.id, d: `M${a.cx},${a.b} L${b.cx},${b.t}`, spine: true, done }];
        }
        // Branch: leave from the side facing the target, arrive on the side facing the source.
        if (Math.abs(a.cx - b.cx) > 40) {
          const rightward = b.cx > a.cx;
          const x1 = rightward ? a.r : a.l;
          const x2 = rightward ? b.l : b.r;
          const mx = (x1 + x2) / 2;
          return [{ id: e.id, d: `M${x1},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${x2},${b.cy}`, spine: false, done }];
        }
        // Same column, different rows.
        const my = (a.b + b.t) / 2;
        return [{ id: e.id, d: `M${a.cx},${a.b} C${a.cx},${my} ${b.cx},${my} ${b.cx},${b.t}`, spine: false, done }];
      });
      setPaths(out);
      setSize({ w: box.width, h: box.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nodes, edges, sideOf]);

  const box = (n: N, side: Side) => {
    const Tag = onSelect ? 'button' : 'div';
    return (
      <Tag
        key={n.id}
        data-node={n.id}
        type={onSelect ? 'button' : undefined}
        onClick={onSelect ? () => onSelect(n) : undefined}
        className={`${s.box} ${side === 'center' ? s.primary : s.secondary} ${n.state ? s[`s-${n.state}`] : ''} ${selectedId === n.id ? s.selected : ''}`}
        aria-pressed={onSelect ? selectedId === n.id : undefined}
        aria-label={`${n.title}${n.state ? `. ${STATE_LABEL[n.state] ?? ''}` : ''}${n.isOptional ? '. Optional' : ''}`}
      >
        <span className={s.boxTitle}>{n.title}</span>
        {n.isOptional && <span className={s.optional}>optional</span>}
        <Badge state={n.state} />
      </Tag>
    );
  };

  return (
    <>
      <div ref={ref} className={`${s.graph} ${s.desktop}`}>
        <svg className={s.svg} width={size.w} height={size.h} aria-hidden>
          {paths.map((p) => (
            <path key={p.id} d={p.d} className={`${p.spine ? s.spine : s.branch} ${p.done ? s.edgeDone : ''}`} />
          ))}
        </svg>
        {rows.map((row, i) => (
          <div key={i} className={s.row}>
            <div className={s.colLeft}>{row.filter((p) => p.side === 'left').map((p) => box(p.node, 'left'))}</div>
            <div className={s.colCenter}>{row.filter((p) => p.side === 'center').map((p) => box(p.node, 'center'))}</div>
            <div className={s.colRight}>{row.filter((p) => p.side === 'right').map((p) => box(p.node, 'right'))}</div>
          </div>
        ))}
      </div>
      <ol className={s.mobileList} aria-label="Roadmap steps">
        {rows.map((row, i) => (
          <li key={i} className={s.mobileRow}>
            {[...row].sort((a, b) => Number(b.side === 'center') - Number(a.side === 'center')).map((p) => box(p.node, p.side))}
          </li>
        ))}
      </ol>
    </>
  );
}
