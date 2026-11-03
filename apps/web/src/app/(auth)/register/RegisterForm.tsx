'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage, post } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { ME_KEY } from '@/features/auth/session';
import type { Me } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import s from '../auth.module.scss';

export const passwordRule = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(100),
  email: z.email('Enter a valid email'),
  password: passwordRule,
});
type Form = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await post<Me>('/auth/register', values);
      qc.setQueryData(ME_KEY, me);
      router.push(safeNext(params.get('next')) ?? '/learn');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account'));
    }
  });

  return (
    <>
      <div>
        <h1 className={s.title}>Begin the trail</h1>
        <p className={s.lead}>Free to join. The first module of every course is open to you.</p>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      <form className={s.form} onSubmit={onSubmit} noValidate>
        <TextField label="Full name" autoComplete="name" {...register('fullName')} error={formState.errors.fullName?.message} hint="Printed on your certificates" />
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="new-password" {...register('password')} error={formState.errors.password?.message} hint="At least 10 characters, with a letter and a number" />
        <Button type="submit" variant="primary" size="lg" block loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className={s.alt}>
        Already learning with us? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
