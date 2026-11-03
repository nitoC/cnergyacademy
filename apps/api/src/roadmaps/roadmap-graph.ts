/**
 * Pure graph logic for roadmaps. Edges point from prerequisite → dependant.
 */
export interface GraphNode {
  id: string;
  position: number;
  isOptional?: boolean;
}
export interface GraphEdge {
  fromNodeId: string;
  toNodeId: string;
}

/** True if adding `candidate` to `edges` would create a cycle (including a self-loop). */
export function wouldCreateCycle(edges: GraphEdge[], candidate: GraphEdge): boolean {
  if (candidate.fromNodeId === candidate.toNodeId) return true;
  // A cycle appears iff `from` is reachable from `to`.
  const adj = adjacency(edges);
  const stack = [candidate.toNodeId];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === candidate.fromNodeId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const next of adj.get(n) ?? []) stack.push(next);
  }
  return false;
}

function adjacency(edges: GraphEdge[]) {
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.fromNodeId, [...(adj.get(e.fromNodeId) ?? []), e.toNodeId]);
  return adj;
}

/** Kahn's algorithm. Returns null when the graph has a cycle. Ties break on node position. */
export function topologicalOrder(nodes: GraphNode[], edges: GraphEdge[]): string[] | null {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.toNodeId, (indeg.get(e.toNodeId) ?? 0) + 1);
  const pos = new Map(nodes.map((n) => [n.id, n.position]));
  const adj = adjacency(edges);
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => pos.get(a)! - pos.get(b)!);
    const n = ready.shift()!;
    order.push(n);
    for (const m of adj.get(n) ?? []) {
      indeg.set(m, indeg.get(m)! - 1);
      if (indeg.get(m) === 0) ready.push(m);
    }
  }
  return order.length === nodes.length ? order : null;
}

/** Depth of each node = longest prerequisite chain above it (roots are 0). Used for layout. */
export function levels(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const order = topologicalOrder(nodes, edges) ?? nodes.map((n) => n.id);
  const level = new Map(nodes.map((n) => [n.id, 0]));
  const incoming = new Map<string, string[]>();
  for (const e of edges) incoming.set(e.toNodeId, [...(incoming.get(e.toNodeId) ?? []), e.fromNodeId]);
  for (const id of order) {
    const parents = incoming.get(id) ?? [];
    if (parents.length) level.set(id, Math.max(...parents.map((p) => level.get(p)! + 1)));
  }
  return level;
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export function validateGraph(
  nodes: (GraphNode & { title: string; type: string; courseId: string | null; moduleId?: string | null; coursePublished?: boolean })[],
  edges: GraphEdge[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nodes.length) issues.push({ code: 'EMPTY', message: 'Add at least one node' });
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.fromNodeId) || !ids.has(e.toNodeId)) issues.push({ code: 'DANGLING_EDGE', message: 'A connection points to a node outside this roadmap' });
  }
  if (nodes.length && !topologicalOrder(nodes, edges)) issues.push({ code: 'CYCLE', message: 'Prerequisites form a loop' });
  for (const n of nodes) {
    if (n.type === 'COURSE' && !n.courseId) issues.push({ code: 'COURSE_MISSING', message: `"${n.title}" must reference a course`, nodeId: n.id });
    if (n.type === 'MODULE' && !n.moduleId) issues.push({ code: 'MODULE_MISSING', message: `"${n.title}" must reference a module of this course`, nodeId: n.id });
    if (n.type === 'COURSE' && n.courseId && n.coursePublished === false) issues.push({ code: 'COURSE_UNPUBLISHED', message: `"${n.title}" references a course that is not published`, nodeId: n.id });
  }
  return issues;
}

export type NodeState = 'COMPLETED' | 'IN_PROGRESS' | 'AVAILABLE' | 'LOCKED_PREMIUM' | 'LOCKED_PREREQUISITE' | 'UPCOMING';
export type NodeAction = 'START_LEARNING' | 'RESUME_LEARNING' | 'VIEW_COURSE' | 'UNLOCK_COURSE' | 'COMPLETE_PREREQUISITE' | 'MARK_COMPLETE' | 'NONE';

export interface NodeFacts {
  id: string;
  /** Course and module steps are learnable: they start, resume or unlock content. */
  isCourse: boolean;
  completed: boolean;
  inProgress: boolean;
  /** Course is paid and the learner holds no entitlement. */
  premiumLocked: boolean;
}

/**
 * Computes learner-facing state for every node from real progress.
 * Optional prerequisites never block their dependants.
 */
export function computeNodeStates(nodes: GraphNode[], edges: GraphEdge[], facts: Map<string, NodeFacts>) {
  const order = topologicalOrder(nodes, edges) ?? nodes.map((n) => n.id);
  const optional = new Set(nodes.filter((n) => n.isOptional).map((n) => n.id));
  const parents = new Map<string, string[]>();
  for (const e of edges) parents.set(e.toNodeId, [...(parents.get(e.toNodeId) ?? []), e.fromNodeId]);
  const result = new Map<string, { state: NodeState; action: NodeAction; blockingNodeIds: string[] }>();

  for (const id of order) {
    const f = facts.get(id)!;
    const blocking = (parents.get(id) ?? []).filter((p) => !optional.has(p) && !facts.get(p)?.completed);
    let state: NodeState;
    let action: NodeAction;
    if (f.completed) {
      state = 'COMPLETED';
      action = f.isCourse ? 'VIEW_COURSE' : 'NONE';
    } else if (blocking.length) {
      const actionable = blocking.every((b) => {
        const s = result.get(b)?.state;
        return s === 'AVAILABLE' || s === 'IN_PROGRESS' || s === 'LOCKED_PREMIUM';
      });
      state = actionable ? 'LOCKED_PREREQUISITE' : 'UPCOMING';
      action = actionable ? 'COMPLETE_PREREQUISITE' : f.isCourse ? 'VIEW_COURSE' : 'NONE';
    } else if (f.inProgress) {
      state = 'IN_PROGRESS';
      action = 'RESUME_LEARNING';
    } else if (f.isCourse && f.premiumLocked) {
      state = 'LOCKED_PREMIUM';
      action = 'UNLOCK_COURSE';
    } else {
      state = 'AVAILABLE';
      action = f.isCourse ? 'START_LEARNING' : 'MARK_COMPLETE';
    }
    result.set(id, { state, action, blockingNodeIds: blocking });
  }
  return result;
}
