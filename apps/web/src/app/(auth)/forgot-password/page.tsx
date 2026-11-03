'use client';
import Link from 'next/link';
import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import s from '../auth.module.scss';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div>
        <h1 className={s.title}>Reset your password</h1>
        <p className={s.lead}>We will email you a link that works for 30 minutes.</p>
      </div>
      {state === 'sent' ? (
        <Callout tone="forest">If an account exists for {email}, a reset link is on its way.</Callout>
      ) : (
        <form
          className={s.form}
          onSubmit={async (e) => {
            e.preventDefault();
            setState('sending');
            setError(null);
            try {
              await post('/auth/forgot-password', { email });
              setState('sent');
            } catch (err) {
              setError(errorMessage(err));
              setState('idle');
            }
          }}
        >
          {error && <Callout tone="danger">{error}</Callout>}
          <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button type="submit" variant="primary" block size="lg" loading={state === 'sending'}>
            Send reset link
          </Button>
        </form>
      )}
      <p className={s.alt}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}
