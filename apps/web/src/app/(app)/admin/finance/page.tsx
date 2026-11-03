'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { amount, dateTime } from '@/lib/format';
import { useCan } from '@/features/auth/session';
import { clean, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, ErrorState, LoadingBlock, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { Facts, PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Summary { revenueShareConfigured: boolean; creatorSharePercent: number | null; grossSales: number; refunds: number; netSales: number; creatorEarnings: number; platformRevenue: number; adjustments: number; salesCount: number; monthly: { month: string; gross: number; refunds: number }[]; creators: { creatorId: string; name: string; grossSales: number; refunds: number; earnings: number }[] }
interface Entry { id: string; type: string; amount: number; currency: string; sharePercent: number | null; memo: string | null; createdAt: string; transaction: { reference: string } | null; course: { title: string } | null; creator: { fullName: string } | null }

export default function FinancePage() {
  const { values, page, set } = useListState(['type', 'from', 'to']);
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [adj, setAdj] = useState<{ amount: string; memo: string } | null>(null);
  const summary = useQuery({ queryKey: ['admin', 'finance', 'summary', values.from, values.to], queryFn: () => get<Summary>('/admin/finance/summary', clean({ from: values.from, to: values.to })) });
  const ledger = useQuery({ queryKey: ['admin', 'finance', 'ledger', values, page], queryFn: () => get<Paginated<Entry>>('/admin/finance/ledger', { ...clean(values), page }), placeholderData: keepPreviousData });
  const adjust = useMutation({ mutationFn: () => post('/admin/finance/adjustments', { amount: Number(adj!.amount), currency: 'NGN', memo: adj!.memo }), onSuccess: () => { toast('Adjustment recorded'); setAdj(null); qc.invalidateQueries({ queryKey: ['admin', 'finance'] }); } });
  const csv = `/api/v1/admin/finance/ledger.csv?${new URLSearchParams(clean({ type: values.type, from: values.from, to: values.to }) as Record<string, string>)}`;
  if (summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return <LoadingBlock />;
  const s = summary.data;
  const maxMonth = Math.max(1, ...s.monthly.map((m) => m.gross));
  return (
    <div className={a.stack}>
      <PageHead title="Revenue & ledger" actions={<>
        <a href={csv} download><Button icon={<Download size={15} />}>Export CSV</Button></a>
        {can('payments.manage') && <Button onClick={() => setAdj({ amount: '', memo: '' })}>Record adjustment</Button>}
      </>} />
      {!s.revenueShareConfigured && <Callout>Creator revenue share is not configured, so sales are recorded gross with no allocation. Set it in <Link className={a.link} href="/admin/settings">Settings</Link> once the model is agreed.</Callout>}
      <Facts items={[
        { label: `Gross sales (${s.salesCount})`, value: amount(s.grossSales) },
        { label: 'Refunds', value: amount(s.refunds) },
        { label: 'Net sales', value: amount(s.netSales) },
        { label: 'Creator earnings', value: s.revenueShareConfigured ? amount(s.creatorEarnings) : '—' },
        { label: 'Platform revenue', value: s.revenueShareConfigured ? amount(s.platformRevenue) : '—' },
      ]} />
      <div className={a.toolbar}>
        <TextField label="From" type="date" value={values.from} onChange={(e) => set({ from: e.target.value })} />
        <TextField label="To" type="date" value={values.to} onChange={(e) => set({ to: e.target.value })} />
        <Select label="Entry type" value={values.type} onChange={(v) => set({ type: v })} options={[{ value: '', label: 'All entries' }, ...['SALE', 'REFUND', 'CREATOR_EARNING', 'PLATFORM_REVENUE', 'CREATOR_EARNING_REVERSAL', 'PLATFORM_REVENUE_REVERSAL', 'ADJUSTMENT'].map((t) => ({ value: t, label: t.toLowerCase().replace(/_/g, ' ') }))]} />
      </div>
      <div className={a.split}>
        <section>
          <h2 className={a.sectionTitle}>Ledger</h2>
          <DataTable loading={ledger.isLoading} error={ledger.error} rows={ledger.data?.items} rowKey={(e) => e.id} empty="No ledger entries" columns={[
            { key: 'd', header: 'When', render: (e) => <span className={a.mono}>{dateTime(e.createdAt)}</span> },
            { key: 't', header: 'Type', render: (e) => <StatusPill status={e.type} /> },
            { key: 'r', header: 'Reference', render: (e) => <Cell primary={<span className={a.mono}>{e.transaction?.reference ?? '—'}</span>} secondary={e.course?.title ?? e.memo ?? undefined} /> },
            { key: 'c', header: 'Creator', render: (e) => e.creator?.fullName ?? '—' },
            { key: 'a', header: 'Amount', numeric: true, render: (e) => <span style={{ color: e.amount < 0 ? 'var(--terracotta-300)' : undefined }}>{amount(e.amount, e.currency)}</span> },
          ]} />
          {ledger.data && <Pagination page={ledger.data.page} totalPages={ledger.data.totalPages} total={ledger.data.total} onPage={(p) => set({ page: p })} />}
        </section>
        <aside className={a.stack}>
          <section>
            <h2 className={a.sectionTitle}>By month</h2>
            <div className={a.bars}>
              {s.monthly.length === 0 && <p className={a.muted}>No sales yet.</p>}
              {s.monthly.map((m) => (
                <div key={m.month} className={a.bar}>
                  <span>{new Date(m.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                  <span className={a.barTrack}><span style={{ width: `${(m.gross / maxMonth) * 100}%` }} /></span>
                  <span className={a.barValue}>{Math.round(m.gross / 1000)}k</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className={a.sectionTitle}>Creators</h2>
            <DataTable rows={s.creators} rowKey={(c) => c.creatorId} empty="No creator sales" columns={[
              { key: 'n', header: 'Creator', render: (c) => c.name },
              { key: 'g', header: 'Gross', numeric: true, render: (c) => amount(c.grossSales) },
              { key: 'e', header: 'Earned', numeric: true, render: (c) => (s.revenueShareConfigured ? amount(c.earnings) : '—') },
            ]} />
          </section>
        </aside>
      </div>
      <Dialog open={!!adj} onClose={() => setAdj(null)} title="Record a ledger adjustment" actions={<><Button variant="tertiary" onClick={() => setAdj(null)}>Cancel</Button><Button variant="primary" loading={adjust.isPending} disabled={!adj?.amount || (adj?.memo.trim().length ?? 0) < 5} onClick={() => adjust.mutate()}>Record</Button></>}>
        {adjust.error && <Callout tone="danger">{errorMessage(adjust.error)}</Callout>}
        {adj && <>
          <TextField label="Amount (NGN, negative for a debit)" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^\d.-]/g, '') })} />
          <TextField label="Memo" value={adj.memo} onChange={(e) => setAdj({ ...adj, memo: e.target.value })} hint="E.g. chargeback fee for SA-…" />
        </>}
      </Dialog>
    </div>
  );
}
