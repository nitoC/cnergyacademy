'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { RoadmapEditor } from '@/features/roadmaps/RoadmapEditor';

/** The course's own roadmap, authored here by the course creator. */
export function RoadmapTab({ courseId }: { courseId: string }) {
  const q = useQuery({ queryKey: ['course-roadmap-id', courseId], queryFn: () => get<{ id: string }>(`/creator/courses/${courseId}/roadmap`) });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={6} />;
  return <RoadmapEditor id={q.data.id} embedded />;
}
