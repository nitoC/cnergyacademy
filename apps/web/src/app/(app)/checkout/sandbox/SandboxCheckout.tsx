'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { amount } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Panel } from '@/components/ui/Feedback';
import a from '../../app.module.scss';

/**
 * Stand-in for a hosted provider checkout, available only when the API runs
 * with PAYMENT_PROVIDER=sandbox outside production. Choosing an outcome
 * records it on the "provider side"; the API still verifies it server-side
 * before granting any access.
 */
export function SandboxCheckout() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? '';
  const callback = params.get('callback') ?? '/checkout/callback';
  const q = useQuery({ queryKey: ['sandbox', reference], queryFn: () => get<{ amount: number; currency: string; courseTitle: string; chargeStatus: string; email: string }>(`/payments/sandbox/${reference}`), enabled: !!reference });
  const done = useMutation({
    mutationFn: (outcome: 'success' | 'failed' | 'abandoned') => post(`/payments/sandbox/${reference}/complete`, { outcome }),
    onSuccess: () => {
      const url = new URL(callback, window.location.origin);
      url.searchParams.set('reference', reference);
      // Only follow same-origin callbacks.
      window.location.assign(url.origin === window.location.origin ? url.toString() : `/checkout/callback?reference=${reference}`);
    },
  });
  if (!reference) return <Callout tone="danger">Missing payment reference.</Callout>;
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock />;
  return (
    <div style={{ maxWidth: 520, margin: '24px auto' }} className={a.stack}>
      <Callout>Sandbox payment provider — no real money moves. Production uses Paystack.</Callout>
      <Panel>
        <div className={a.stackSm}>
          <span className={a.muted}>Paying as {q.data.email}</span>
          <strong style={{ color: 'var(--ink-0)', fontSize: '1.1rem' }}>{q.data.courseTitle}</strong>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--ink-0)' }}>{amount(q.data.amount, q.data.currency)}</span>
          <span className={a.mono}>Ref {reference}</span>
          {q.data.chargeStatus !== 'pending' && <Callout>This charge is already {q.data.chargeStatus}.</Callout>}
          {done.error && <Callout tone="danger">{errorMessage(done.error)}</Callout>}
          <div className={a.row} style={{ marginTop: 8 }}>
            <Button variant="primary" loading={done.isPending && done.variables === 'success'} onClick={() => done.mutate('success')}>Approve payment</Button>
            <Button variant="danger" loading={done.isPending && done.variables === 'failed'} onClick={() => done.mutate('failed')}>Decline</Button>
            <Button variant="tertiary" onClick={() => done.mutate('abandoned')}>Cancel checkout</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
