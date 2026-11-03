'use client';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { get } from '@/lib/api';
import { ButtonLink } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';
import type { EditorCourse } from './types';
import { DetailsTab } from './DetailsTab';
import { CurriculumTab } from './CurriculumTab';
import { PricingTab } from './PricingTab';
import { ReviewTab } from './ReviewTab';
import { LearnersTab } from './LearnersTab';
import { RoadmapTab } from './RoadmapTab';

type Tab = 'details' | 'curriculum' | 'roadmap' | 'pricing' | 'review' | 'learners';

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (params.get('tab') as Tab) || 'details';
  const q = useQuery({ queryKey: ['editor', id], queryFn: () => get<EditorCourse>(`/creator/courses/${id}`) });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <LoadingBlock rows={8} />;
  const c = q.data;
  const last = c.reviews[0];
  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: '/creator/courses', label: 'Courses' }]}
        title={c.title}
        subtitle={<span className={a.row}><StatusPill status={c.status} /> {c.subject.name}</span>}
        actions={<ButtonLink href={`/learn/courses/${c.id}`} icon={<Eye size={15} />}>Preview as learner</ButtonLink>}
      />
      {c.status === 'REJECTED' && last?.decision === 'REJECTED' && <Callout tone="danger">Changes requested by {last.actor.fullName}: {last.feedback}</Callout>}
      {c.status === 'SUBMITTED' && <Callout>This course is with an administrator for review. Content is locked until they decide — or withdraw it to keep editing.</Callout>}
      {c.status === 'APPROVED' && <Callout tone="forest">Approved. Publish it from the Review tab when you are ready.</Callout>}
      <ButtonTabs
        label="Editor sections"
        value={tab}
        onChange={(t) => router.replace(`${pathname}?tab=${t}`)}
        tabs={[
          { value: 'details', label: 'Details' },
          { value: 'curriculum', label: 'Curriculum' },
          { value: 'roadmap', label: 'Roadmap' },
          { value: 'pricing', label: 'Pricing' },
          { value: 'review', label: 'Review & publish' },
          { value: 'learners', label: 'Learners' },
        ]}
      />
      {tab === 'details' && <DetailsTab course={c} />}
      {tab === 'curriculum' && <CurriculumTab course={c} />}
      {tab === 'roadmap' && <RoadmapTab courseId={c.id} />}
      {tab === 'pricing' && <PricingTab course={c} />}
      {tab === 'review' && <ReviewTab course={c} />}
      {tab === 'learners' && <LearnersTab courseId={c.id} />}
    </div>
  );
}

export default function CourseEditorPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
