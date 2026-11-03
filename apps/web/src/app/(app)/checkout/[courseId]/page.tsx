'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { useMe } from '@/features/auth/session';
import type { CourseDetail } from '@/types/api';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Panel } from '@/components/ui/Feedback';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

export default function CheckoutPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { data: me } = useMe();
  const course = useQuery({ queryKey: ['course', courseId], queryFn: () => get<CourseDetail>(`/courses/${courseId}`) });
  const pay = useMutation({
    mutationFn: () => post<{ authorizationUrl: string; reference: string }>('/payments/initialize', { courseId }),
    // Hand off to the provider's hosted checkout. Access is granted only after
    // the API verifies the payment with the provider.
    onSuccess: (r) => window.location.assign(r.authorizationUrl),
  });

  if (course.error) return <ErrorState error={course.error} />;
  if (!course.data) return <LoadingBlock />;
  const c = course.data;
  const premium = c.modules.filter((m) => m.access.startsWith('PREMIUM')).length;

  return (
    <div style={{ maxWidth: 760 }} className={a.stack}>
      <PageHead crumbs={[{ href: `/courses/${c.slug}`, label: c.title }]} title="Checkout" />
      {c.viewer.hasEntitlement ? (
        <Callout tone="forest">
          You already own this course. <a className={a.link} href={`/learn/courses/${c.id}`}>Go to the course</a>
        </Callout>
      ) : (
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 20, alignItems: 'center' }}>
            <div style={{ aspectRatio: '4 / 3', borderRadius: 6, overflow: 'hidden' }}>
              <CourseCover seed={c.slug} pattern={c.coverPattern} accent={c.subject.accentColor} thumbnailUrl={c.thumbnailUrl} />
            </div>
            <div className={a.stackSm}>
              <strong style={{ color: 'var(--ink-0)', fontSize: '1.1rem' }}>{c.title}</strong>
              <span className={a.muted}>
                Full access to all {c.modules.length} modules ({premium} premium) · lifetime access · certificate on completion
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--ink-0)' }}>{money(c.price, c.currency)}</span>
            </div>
          </div>
          <div className={a.stackSm} style={{ marginTop: 20 }}>
            {!me?.emailVerified && <Callout>Confirm your email address before purchasing — use the banner at the top of the page to resend the link.</Callout>}
            {c.modules.some((m) => m.prerequisiteQuiz) && (
              <Callout>Some modules also require you to pass a checkpoint quiz. Buying the course does not skip those checkpoints.</Callout>
            )}
            {pay.error && <Callout tone="danger">{errorMessage(pay.error)}</Callout>}
            <div className={a.row}>
              <Button variant="primary" size="lg" loading={pay.isPending} disabled={!me?.emailVerified} onClick={() => pay.mutate()} icon={<Lock size={16} />}>
                Pay {money(c.price, c.currency)}
              </Button>
              <ButtonLink variant="tertiary" href={`/courses/${c.slug}`}>Cancel</ButtonLink>
            </div>
            <span className={a.muted} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <ShieldCheck size={14} /> You will be taken to our payment provider to complete payment securely.
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
}
