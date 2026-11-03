'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { passwordRule } from '../register/RegisterForm';
import s from '../auth.module.scss';

export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!token) return <Callout tone="danger">This reset link is incomplete. Request a new one.</Callout>;
  return (
    <>
      <h1 className={s.title}>Choose a new password</h1>
      {done ? (
        <Callout tone="forest">
          Password updated. Every other session has been signed out. <Link href="/login">Sign in</Link>
        </Callout>
      ) : (
        <form
          className={s.form}
          onSubmit={async (e) => {
            e.preventDefault();
            const check = passwordRule.safeParse(password);
            if (!check.success) return setFieldError(check.error.issues[0].message);
            setFieldError(undefined);
            setBusy(true);
            try {
              await post('/auth/reset-password', { token, password });
              setDone(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Callout tone="danger">{error}</Callout>}
          <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} hint="At least 10 characters, with a letter and a number" />
          <Button type="submit" variant="primary" block size="lg" loading={busy}>
            Update password
          </Button>
        </form>
      )}
    </>
  );
}
