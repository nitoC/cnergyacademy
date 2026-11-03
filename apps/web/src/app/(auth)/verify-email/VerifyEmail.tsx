'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { ME_KEY } from '@/features/auth/session';
import { ButtonLink } from '@/components/ui/Button';
import { Callout, LoadingBlock } from '@/components/ui/Feedback';
import s from '../auth.module.scss';

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const qc = useQueryClient();
  const [state, setState] = useState<{ status: 'pending' | 'ok' | 'error'; message?: string }>(() =>
    token ? { status: 'pending' } : { status: 'error', message: 'This link is incomplete.' },
  );
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return;
    post('/auth/verify-email', { token })
      .then(() => {
        setState({ status: 'ok' });
        qc.invalidateQueries({ queryKey: ME_KEY });
      })
      .catch((err) => setState({ status: 'error', message: errorMessage(err) }));
  }, [token, qc]);
  return (
    <>
      <h1 className={s.title}>Confirm your email</h1>
      {state.status === 'pending' && <LoadingBlock rows={2} />}
      {state.status === 'ok' && (
        <>
          <Callout tone="forest">Your email is confirmed. Purchases and creator applications are now open to you.</Callout>
          <ButtonLink href="/learn" variant="primary">Go to my learning</ButtonLink>
        </>
      )}
      {state.status === 'error' && (
        <>
          <Callout tone="danger">{state.message}</Callout>
          <ButtonLink href="/profile">Request a new link</ButtonLink>
        </>
      )}
    </>
  );
}
