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

const schema = z.object({ email: z.email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type Form = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await post<Me>('/auth/login', values);
      qc.setQueryData(ME_KEY, me);
      const next = safeNext(params.get('next'));
      router.push(next ?? (me.permissions.includes('admin.access') ? '/admin' : me.roles.includes('CREATOR') ? '/creator' : '/learn'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in'));
    }
  });

  return (
    <>
      <div>
        <h1 className={s.title}>Welcome back</h1>
        <p className={s.lead}>Pick up exactly where you left off.</p>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      <form className={s.form} onSubmit={onSubmit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="current-password" {...register('password')} error={formState.errors.password?.message} />
        <Button type="submit" variant="primary" size="lg" block loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className={s.alt}>
        <Link href="/forgot-password">Forgot your password?</Link> · New here? <Link href={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>Create an account</Link>
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <p className={s.devNote}>
          Development accounts (password <code>Academy2026!dev</code>): <code>chidi.eze@academy.local</code> learner · <code>ada.okafor@academy.local</code> creator · <code>kemi.adeyemi@academy.local</code> mentor · <code>admin@academy.local</code> admin
        </p>
      )}
    </>
  );
}
