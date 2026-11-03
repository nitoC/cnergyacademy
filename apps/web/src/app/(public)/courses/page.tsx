import { Suspense } from 'react';
import { LoadingBlock } from '@/components/ui/Feedback';
import { CourseDiscovery } from './CourseDiscovery';

export const metadata = { title: 'Courses' };

export default function CoursesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48 }}><LoadingBlock /></div>}>
      <CourseDiscovery />
    </Suspense>
  );
}
