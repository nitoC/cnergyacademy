'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { errorMessage, post } from '@/lib/api';
import { ButtonLink } from '@/components/ui/Button';
import { Callout, LoadingBlock, Panel } from '@/components/ui/Feedback';
import a from '../../app.module.scss';

interface Verify { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'REFUNDED'; entitlementGranted: boolean; course: { id: string; slug: string; title: string } }

/** Returning from checkout. The redirect itself proves nothing — we ask the API to verify with the provider. */
export function CheckoutCallback() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['verify', reference],
    queryFn: () => post<Verify>('/payments/verify', { reference }),
    enabled: !!reference,
    retry: 3,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 4000 : false),
  });
  useEffect(() => {
    if (q.data?.entitlementGranted) {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  }, [q.data, qc]);

  if (!reference) return <Callout tone="danger">No payment reference was returned.</Callout>;
  return (
    <div style={{ maxWidth: 560, margin: '24px auto' }}>
      <Panel>
        <div className={a.stackSm}>
          <span className={a.mono}>Ref {reference}</span>
          {q.error ? (
            <Callout tone="danger">{errorMessage(q.error, 'We could not confirm the payment yet.')} If you were charged, access will be granted automatically once the provider confirms.</Callout>
          ) : !q.data || q.data.status === 'PENDING' ? (
            <>
              <h1 className={a.title}>Confirming your payment…</h1>
              <LoadingBlock rows={2} />
            </>
          ) : q.data.status === 'SUCCESSFUL' ? (
            <>
              <h1 className={a.title}>You&apos;re in.</h1>
              <p>Payment confirmed. The full course “{q.data.course.title}” is now open to you.</p>
              <ButtonLink variant="primary" href={`/learn/courses/${q.data.course.id}`}>Continue to the course</ButtonLink>
            </>
          ) : (
            <>
              <h1 className={a.title}>{q.data.status === 'CANCELLED' ? 'Checkout cancelled' : 'Payment did not go through'}</h1>
              <p>No access was granted and you were not charged by us. You can try again whenever you are ready.</p>
              <ButtonLink variant="primary" href={`/checkout/${q.data.course.id}`}>Try again</ButtonLink>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
