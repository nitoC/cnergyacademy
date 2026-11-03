'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const ROW = 170;
const STATE_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  AVAILABLE: 'Available now',
  LOCKED_PREMIUM: 'Premium course',
  LOCKED_PREREQUISITE: 'Complete the prerequisite first',
  UPCOMING: 'Upcoming',
};

/**
 * Layered roadmap graph. Rows are prerequisite depth (computed by the API);
 * edges are drawn between measured card positions so the layout stays
 * correct at any width.
 */
export function RoadmapGraph<N extends GraphNodeView>({ nodes, edges, renderBody }: { nodes: N[]; edges: GraphEdgeView[]; renderBody?: (n: N) => ReactNode }) {
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const rows = levels.map((l) => nodes.filter((n) => n.level === l).sort((a, b) => a.position - b.position));
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ id: string; d: string; done: boolean }[]>([]);
  const height = rows.length * ROW;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const centre = (id: string) => {
        const n = el.querySelector<HTMLElement>(`[data-node="${id}"]`);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bottom: r.bottom - box.top };
      };
      setLines(
        edges.flatMap((e) => {
          const a = centre(e.fromNodeId);
          const b = centre(e.toNodeId);
          if (!a || !b) return [];
          const midY = (a.bottom + b.top) / 2;
          const from = nodes.find((n) => n.id === e.fromNodeId);
          return [{ id: e.id, d: `M${a.x},${a.bottom} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.top}`, done: from?.state === 'COMPLETED' }];
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nodes, edges]);

  const card = (n: N) => (
    <article key={n.id} data-node={n.id} className={`${s.node} ${n.state ? s[`s-${n.state}`] : ''}`}>
      <div className={s.type}>
        <span>{n.type.toLowerCase()}</span>
        {n.isOptional && <span className={s.optional}>optional</span>}
      </div>
      <div className={s.title}>{n.title}</div>
      {n.state && <div className={s.state}>{STATE_LABEL[n.state] ?? n.state}</div>}
      {renderBody?.(n)}
    </article>
  );

  return (
    <>
      <div ref={ref} className={`${s.graph} ${s.desktop}`} style={{ height }}>
        <svg className={s.svg} aria-hidden>
          <defs>
            <marker id="rm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--edge-marker)' }} />
            </marker>
          </defs>
          {lines.map((l) => (
            <path key={l.id} d={l.d} fill="none" style={{ stroke: l.done ? 'var(--forest-400)' : 'var(--edge)' }} strokeOpacity={l.done ? 0.9 : 0.3} strokeWidth={l.done ? 2 : 1.4} strokeDasharray={l.done ? undefined : '4 5'} markerEnd="url(#rm-arrow)" />
          ))}
        </svg>
        {rows.map((row, i) => (
          <div key={i} className={s.level} style={{ top: i * ROW + 10 }}>
            {row.map(card)}
          </div>
        ))}
      </div>
      <ol className={s.mobileList} aria-label="Roadmap steps">
        {rows.flat().map((n) => (
          <li key={n.id} style={{ listStyle: 'none' }}>
            {card(n)}
          </li>
        ))}
      </ol>
    </>
  );
}
