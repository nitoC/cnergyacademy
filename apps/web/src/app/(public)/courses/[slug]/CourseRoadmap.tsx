'use client';
import { RoadmapBoard } from '@/features/roadmaps/RoadmapBoard';

export function CourseRoadmap({ slug }: { slug: string }) {
  return <RoadmapBoard path={`/courses/${slug}/roadmap`} />;
}
