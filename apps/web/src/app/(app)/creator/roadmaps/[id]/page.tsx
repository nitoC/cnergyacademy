'use client';
import { useParams } from 'next/navigation';
import { RoadmapEditor } from '@/features/roadmaps/RoadmapEditor';

export default function RoadmapEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <RoadmapEditor id={id} />;
}
