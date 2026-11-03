'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { errorMessage, post } from '@/lib/api';
import type { CourseDetail } from '@/types/api';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Progress, useToast } from '@/components/ui/Feedback';

/** Primary action for a course: enrol, buy, continue or preview — decided from the server's viewer state. */
export function CourseCta({ course }: { course: CourseDetail }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const v = course.viewer;
  const journey = `/learn/courses/${course.id}`;
  const enroll = useMutation({
    mutationFn: () => post('/enrollments', { courseId: course.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.push(journey);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (!v.authenticated) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <ButtonLink href={`/register?next=/courses/${course.slug}`} variant="primary" block size="lg">
          {course.isFree ? 'Start learning free' : 'Start with the free lessons'}
        </ButtonLink>
        <ButtonLink href={`/login?next=/courses/${course.slug}`} variant="tertiary" block>
          I already have an account
        </ButtonLink>
      </div>
    );
  }
  if (v.isStaff) {
    return (
      <ButtonLink href={journey} variant="secondary" block size="lg">
        Preview as staff
      </ButtonLink>
    );
  }
  const owns = course.isFree || v.hasEntitlement;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {v.progress && (
        <div style={{ display: 'grid', gap: 6, fontSize: '0.82rem', color: 'var(--ink-2)' }}>
          <Progress value={v.progress.percent} label="Course progress" />
          {v.progress.percent}% complete
        </div>
      )}
      {v.enrolled ? (
        <ButtonLink href={journey} variant="primary" block size="lg">
          {v.progress?.isComplete ? 'Review course' : 'Continue learning'}
        </ButtonLink>
      ) : (
        <Button variant="primary" block size="lg" loading={enroll.isPending} onClick={() => enroll.mutate()}>
          {owns ? 'Enrol and start' : 'Start the free lessons'}
        </Button>
      )}
      {!owns && (
        <ButtonLink href={`/checkout/${course.id}`} variant="amber" block>
          Buy the full course
        </ButtonLink>
      )}
    </div>
  );
}
