import { computeNodeStates, levels, NodeFacts, topologicalOrder, validateGraph, wouldCreateCycle } from './roadmap-graph';

const nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, position: i + 1 }));
const edges = [
  { fromNodeId: 'a', toNodeId: 'b' },
  { fromNodeId: 'b', toNodeId: 'c' },
  { fromNodeId: 'a', toNodeId: 'd' },
];

describe('roadmap graph', () => {
  it('detects cycles including self-loops', () => {
    expect(wouldCreateCycle(edges, { fromNodeId: 'c', toNodeId: 'a' })).toBe(true);
    expect(wouldCreateCycle(edges, { fromNodeId: 'b', toNodeId: 'b' })).toBe(true);
    expect(wouldCreateCycle(edges, { fromNodeId: 'd', toNodeId: 'c' })).toBe(false);
  });

  it('orders nodes topologically and computes layout levels', () => {
    expect(topologicalOrder(nodes, edges)).toEqual(['a', 'b', 'c', 'd']);
    expect(topologicalOrder(nodes, [...edges, { fromNodeId: 'c', toNodeId: 'a' }])).toBeNull();
    const l = levels(nodes, edges);
    expect([l.get('a'), l.get('b'), l.get('c'), l.get('d')]).toEqual([0, 1, 2, 1]);
  });

  it('validates structure before publication', () => {
    const v = validateGraph(
      [{ id: 'x', position: 1, title: 'Course', type: 'COURSE', courseId: null }, { id: 'y', position: 2, title: 'Draft course', type: 'COURSE', courseId: 'c1', coursePublished: false }],
      [],
    );
    expect(v.map((i) => i.code)).toEqual(['COURSE_MISSING', 'COURSE_UNPUBLISHED']);
    expect(validateGraph([], []).map((i) => i.code)).toEqual(['EMPTY']);
  });

  it('computes learner states from progress and entitlements', () => {
    const facts = new Map<string, NodeFacts>([
      ['a', { id: 'a', isCourse: true, completed: true, inProgress: false, premiumLocked: false }],
      ['b', { id: 'b', isCourse: true, completed: false, inProgress: false, premiumLocked: true }],
      ['c', { id: 'c', isCourse: false, completed: false, inProgress: false, premiumLocked: false }],
      ['d', { id: 'd', isCourse: true, completed: false, inProgress: true, premiumLocked: false }],
    ]);
    const s = computeNodeStates(nodes, edges, facts);
    expect(s.get('a')).toMatchObject({ state: 'COMPLETED', action: 'VIEW_COURSE' });
    expect(s.get('b')).toMatchObject({ state: 'LOCKED_PREMIUM', action: 'UNLOCK_COURSE' });
    expect(s.get('c')).toMatchObject({ state: 'LOCKED_PREREQUISITE', action: 'COMPLETE_PREREQUISITE', blockingNodeIds: ['b'] });
    expect(s.get('d')).toMatchObject({ state: 'IN_PROGRESS', action: 'RESUME_LEARNING' });
  });

  it('marks deeper locked nodes as upcoming and ignores optional prerequisites', () => {
    const chain = [...edges, { fromNodeId: 'c', toNodeId: 'd' }];
    const facts = new Map<string, NodeFacts>(nodes.map((n) => [n.id, { id: n.id, isCourse: false, completed: false, inProgress: false, premiumLocked: false }]));
    const s = computeNodeStates(nodes, chain, facts);
    expect(s.get('a')!.state).toBe('AVAILABLE');
    expect(s.get('b')!.state).toBe('LOCKED_PREREQUISITE');
    expect(s.get('c')!.state).toBe('UPCOMING');
    const optional = computeNodeStates(nodes.map((n) => (n.id === 'a' ? { ...n, isOptional: true } : n)), edges, facts);
    expect(optional.get('b')!.state).toBe('AVAILABLE');
  });
});
