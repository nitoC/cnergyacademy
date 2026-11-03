import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { layoutRoadmap, RoadmapGraph } from './RoadmapGraph';

const nodes = [
  { id: 'a', type: 'COURSE', title: 'Foundations', level: 0, position: 1, state: 'COMPLETED' },
  { id: 'b', type: 'TOPIC', title: 'Git habits', level: 1, position: 2, state: 'AVAILABLE' },
  { id: 'c', type: 'COURSE', title: 'APIs', level: 1, position: 3, state: 'IN_PROGRESS' },
  { id: 'd', type: 'COURSE', title: 'Cloud', level: 2, position: 4, state: 'LOCKED_PREREQUISITE' },
  { id: 'e', type: 'MILESTONE', title: 'Portfolio', level: 2, position: 5, state: 'UPCOMING' },
];
const edges = [
  { id: '1', fromNodeId: 'a', toNodeId: 'b' },
  { id: '2', fromNodeId: 'a', toNodeId: 'c' },
  { id: '3', fromNodeId: 'c', toNodeId: 'd' },
  { id: '4', fromNodeId: 'b', toNodeId: 'e' },
];

describe('layoutRoadmap', () => {
  it('puts one spine step per level, continuing from the previous spine step', () => {
    const rows = layoutRoadmap(nodes, edges);
    expect(rows.map((r) => r.find((p) => p.side === 'center')!.node.id)).toEqual(['a', 'c', 'd']);
  });

  it('alternates branch sides across rows so connectors do not cross', () => {
    const rows = layoutRoadmap(nodes, edges);
    expect(rows[1].find((p) => p.node.id === 'b')!.side).toBe('right');
    expect(rows[2].find((p) => p.node.id === 'e')!.side).toBe('left');
  });
});

describe('RoadmapGraph', () => {
  it('renders every step as a selectable button with its status', async () => {
    const onSelect = vi.fn();
    render(<RoadmapGraph nodes={nodes} edges={edges} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /^Cloud\. Complete the prerequisite first/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }));
    expect(screen.getByRole('button', { name: /Foundations\. Completed/ })).toBeInTheDocument();
  });
});
