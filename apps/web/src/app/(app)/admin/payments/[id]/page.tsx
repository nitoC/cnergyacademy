'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { amount, dateTime } from '@/lib/format';
import { useCan } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea } from '@/components/ui/Field';
import { DataTable } from '@/components/ui/Table';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';

interface Detail {
  id: string; reference: string; provider: string; providerReference: string | null; amount: string; currency: string; status: string; channel: string | null; failureReason: string | null;
  createdAt: string; verifiedAt: string | null; paidAt: string | null; refundedAt: string | null; lastReconciledAt: string | null;
  user: { id: string; fullName: string; email: string }; course: { id: string; title: string; creator: { fullName: string } };
  entitlement: { grantedAt: string; revokedAt: string | null; revokeReason: string | null } | null;
  ledgerEntries: { id: string; type: string; amount: string; currency: string; sharePercent: string | null; createdAt: string; memo: string | null }[];
  events: { id: string; type: string; eventKey: string; receivedAt: string }[];
}

export default function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'payment', id], queryFn: () => get<Detail>(`/admin/payments/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const reconcile = useMutation({ mutationFn: () => post<{ status: string }>(`/admin/payments/${id}/reconcile`), onSuccess: (r) => { toast(`Provider says: ${r.status.toLowerCase()}`); refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });
  const doRefund = useMutation({ mutationFn: () => post(`/admin/payments/${id}/refund`, { reason }), onSuccess: () => { toast('Refund recorded and access revoked'); setRefund(false); refresh(); } });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock />;
  const t = q.data;
  return (
    <div className={a.stack}>
      <PageHead
        crumbs={[{ href: '/admin/payments', label: 'Payments' }]}
        title={<span className={a.mono} style={{ fontSize: '1.6rem' }}>{t.reference}</span>}
        subtitle={<span className={a.row}><StatusPill status={t.status} /> {amount(Number(t.amount), t.currency)} · {t.provider}</span>}
        actions={can('payments.manage') && (<>
          {t.status !== 'SUCCESSFUL' && t.status !== 'REFUNDED' && <Button loading={reconcile.isPending} onClick={() => reconcile.mutate()}>Re-verify with provider</Button>}
          {t.status === 'SUCCESSFUL' && <Button variant="danger" onClick={() => setRefund(true)}>Record refund</Button>}
        </>)}
      />
      {t.failureReason && <Callout tone={t.status === 'SUCCESSFUL' ? 'amber' : 'danger'}>{t.failureReason}</Callout>}
      <div className={a.split2}>
        <Panel>
          <dl className={a.dl}>
            <dt>Learner</dt><dd>{t.user.fullName} · {t.user.email}</dd>
            <dt>Course</dt><dd>{t.course.title} (creator {t.course.creator.fullName})</dd>
            <dt>Provider ref</dt><dd className={a.mono}>{t.providerReference ?? '—'}</dd>
            <dt>Channel</dt><dd>{t.channel ?? '—'}</dd>
            <dt>Created</dt><dd>{dateTime(t.createdAt)}</dd>
            <dt>Verified</dt><dd>{dateTime(t.verifiedAt)}</dd>
            <dt>Paid</dt><dd>{dateTime(t.paidAt)}</dd>
            <dt>Last reconciled</dt><dd>{dateTime(t.lastReconciledAt)}</dd>
            {t.refundedAt && (<><dt>Refunded</dt><dd>{dateTime(t.refundedAt)}</dd></>)}
          </dl>
        </Panel>
        <Panel>
          <h2 className={a.sectionTitle}>Entitlement</h2>
          {t.entitlement ? (
            <dl className={a.dl}>
              <dt>Granted</dt><dd>{dateTime(t.entitlement.grantedAt)}</dd>
              <dt>State</dt><dd>{t.entitlement.revokedAt ? `Revoked — ${t.entitlement.revokeReason}` : 'Active'}</dd>
            </dl>
          ) : <p className={a.muted}>No entitlement is linked to this payment.</p>}
        </Panel>
      </div>
      <section>
        <h2 className={a.sectionTitle}>Ledger entries</h2>
        <DataTable rows={t.ledgerEntries} rowKey={(e) => e.id} empty="No ledger entries (only verified payments create them)" columns={[
          { key: 't', header: 'Type', render: (e) => <StatusPill status={e.type} /> },
          { key: 'a', header: 'Amount', numeric: true, render: (e) => amount(Number(e.amount), e.currency) },
          { key: 's', header: 'Share', numeric: true, render: (e) => (e.sharePercent ? `${Number(e.sharePercent)}%` : '—') },
          { key: 'm', header: 'Memo', render: (e) => e.memo },
          { key: 'd', header: 'When', render: (e) => dateTime(e.createdAt) },
        ]} />
      </section>
      <section>
        <h2 className={a.sectionTitle}>Provider events</h2>
        <DataTable rows={t.events} rowKey={(e) => e.id} empty="No events received" columns={[
          { key: 't', header: 'Event', render: (e) => <span className={a.mono}>{e.type}</span> },
          { key: 'k', header: 'Key', render: (e) => <span className={a.muted}>{e.eventKey}</span> },
          { key: 'd', header: 'Received', render: (e) => dateTime(e.receivedAt) },
        ]} />
      </section>
      <Dialog open={refund} onClose={() => setRefund(false)} title="Record a refund" actions={<><Button variant="tertiary" onClick={() => setRefund(false)}>Cancel</Button><Button variant="danger" loading={doRefund.isPending} disabled={reason.trim().length < 5} onClick={() => doRefund.mutate()}>Record refund</Button></>}>
        <Callout>Process the refund with the provider first. This records it, revokes the learner&apos;s access and writes reversing ledger entries.</Callout>
        {doRefund.error && <Callout tone="danger">{errorMessage(doRefund.error)}</Callout>}
        <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </div>
  );
}
