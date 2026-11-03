'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { errorMessage, get, post } from '@/lib/api';
import { amount, dateTime } from '@/lib/format';
import { useCan } from '@/features/auth/session';
import { clean, useDebouncedSearch, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { StatusPill, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { Facts, PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Row { id: string; reference: string; amount: string; currency: string; status: string; provider: string; createdAt: string; failureReason: string | null; user: { fullName: string; email: string }; course: { title: string } }
type Resp = Paginated<Row> & { summary: { status: string; count: number; amount: number }[] };

export default function PaymentsPage() {
  const { values, page, set } = useListState(['status', 'search', 'flagged']);
  const [text, setText] = useDebouncedSearch(values.search, (v) => set({ search: v }));
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'payments', values, page], queryFn: () => get<Resp>('/admin/payments', { ...clean(values), page }), placeholderData: keepPreviousData });
  const reconcile = useMutation({
    mutationFn: () => post<{ checked: number }>('/admin/payments/reconcile'),
    onSuccess: (r) => { toast(`Re-verified ${r.checked} pending payments with the provider`); qc.invalidateQueries({ queryKey: ['admin', 'payments'] }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const sum = (s: string) => q.data?.summary.find((x) => x.status === s);
  return (
    <div className={a.stack}>
      <PageHead title="Payments" subtitle="Every checkout attempt, verified server-side with the provider." actions={can('payments.manage') && <Button loading={reconcile.isPending} onClick={() => reconcile.mutate()}>Reconcile pending</Button>} />
      <Facts items={[
        { label: 'Successful', value: `${sum('SUCCESSFUL')?.count ?? 0} · ${amount(sum('SUCCESSFUL')?.amount ?? 0)}` },
        { label: 'Pending', value: sum('PENDING')?.count ?? 0 },
        { label: 'Failed', value: sum('FAILED')?.count ?? 0 },
        { label: 'Refunded', value: `${sum('REFUNDED')?.count ?? 0} · ${amount(sum('REFUNDED')?.amount ?? 0)}` },
      ]} />
      <div className={a.toolbar}>
        <div className={a.grow}><TextField label="Search" placeholder="Reference, email or course" type="search" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <Select label="Status" value={values.status} onChange={(v) => set({ status: v })} options={[{ value: '', label: 'Any status' }, ...['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]} />
        <div style={{ alignSelf: 'end', paddingBottom: 10, minWidth: 0 }}><Checkbox label="Flagged only" checked={values.flagged === 'true'} onChange={(e) => set({ flagged: e.target.checked ? 'true' : '' })} /></div>
      </div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        retry={() => q.refetch()}
        rows={q.data?.items}
        rowKey={(t) => t.id}
        empty="No transactions"
        columns={[
          { key: 'r', header: 'Reference', render: (t) => <Link href={`/admin/payments/${t.id}`}><Cell primary={<span className={a.mono}>{t.reference}</span>} secondary={t.failureReason ?? t.provider} /></Link> },
          { key: 'u', header: 'Learner', render: (t) => <Cell primary={t.user.fullName} secondary={t.user.email} /> },
          { key: 'c', header: 'Course', render: (t) => t.course.title },
          { key: 'a', header: 'Amount', numeric: true, render: (t) => amount(Number(t.amount), t.currency) },
          { key: 's', header: 'Status', render: (t) => <StatusPill status={t.status} /> },
          { key: 'd', header: 'Created', render: (t) => dateTime(t.createdAt) },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
    </div>
  );
}
