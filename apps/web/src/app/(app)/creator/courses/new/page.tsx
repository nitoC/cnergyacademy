'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, get, post } from '@/lib/api';
import type { Subject } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout, Panel } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';

const schema = z.object({
  title: z.string().trim().min(4, 'At least 4 characters').max(120),
  shortDescription: z.string().trim().min(10, 'At least 10 characters').max(240),
  subjectId: z.string().uuid('Choose a subject'),
  categoryId: z.string().optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  proposedPrice: z.string().regex(/^\d*(\.\d{0,2})?$/, 'Enter an amount like 15000'),
});
type Form = z.infer<typeof schema>;

export default function NewCourse() {
  const router = useRouter();
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const { register, handleSubmit, control, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { difficulty: 'BEGINNER', proposedPrice: '' } });
  const subjectId = useWatch({ control, name: 'subjectId' });
  const subject = subjects.data?.find((s) => s.id === subjectId);
  const create = useMutation({
    mutationFn: (v: Form) =>
      post<{ id: string }>('/creator/courses', {
        title: v.title,
        shortDescription: v.shortDescription,
        subjectId: v.subjectId,
        categoryId: v.categoryId || undefined,
        difficulty: v.difficulty,
        proposedPrice: v.proposedPrice ? Number(v.proposedPrice) : undefined,
      }),
    onSuccess: (c) => router.push(`/creator/courses/${c.id}?tab=curriculum`),
  });
  return (
    <div className={a.stack} style={{ maxWidth: 820 }}>
      <PageHead crumbs={[{ href: '/creator/courses', label: 'Courses' }]} title="New course" subtitle="Start with the essentials. You will add modules, lessons and quizzes next." />
      <Panel>
        <form className={a.formGrid} onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
          {create.error && <div className={a.full}><Callout tone="danger">{errorMessage(create.error)}</Callout></div>}
          <div className={a.full}><TextField label="Title" {...register('title')} error={formState.errors.title?.message} /></div>
          <div className={a.full}><TextArea label="Short description" rows={2} {...register('shortDescription')} error={formState.errors.shortDescription?.message} hint="One or two sentences shown in the catalogue" /></div>
          <Controller control={control} name="subjectId" render={({ field }) => <Select label="Subject" value={field.value} onChange={field.onChange} error={formState.errors.subjectId?.message} options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />} />
          <Controller control={control} name="categoryId" render={({ field }) => <Select label="Category" value={field.value ?? ''} onChange={field.onChange} disabled={!subject} placeholder={subject ? 'Choose…' : 'Pick a subject first'} options={[{ value: '', label: 'None' }, ...(subject?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />} />
          <Controller control={control} name="difficulty" render={({ field }) => <Select label="Level" value={field.value} onChange={field.onChange} options={[{ value: 'BEGINNER', label: 'Beginner' }, { value: 'INTERMEDIATE', label: 'Intermediate' }, { value: 'ADVANCED', label: 'Advanced' }]} />} />
          <TextField label="Proposed price (NGN)" inputMode="decimal" placeholder="Leave empty for a free course" {...register('proposedPrice')} error={formState.errors.proposedPrice?.message} hint="An administrator approves the final price" />
          <div className={a.full}><Button type="submit" variant="primary" loading={create.isPending}>Create course</Button></div>
        </form>
      </Panel>
    </div>
  );
}
