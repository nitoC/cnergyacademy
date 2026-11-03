'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { get } from '@/lib/api';
import { amount, dateTime } from '@/lib/format';
import { ErrorState, StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Trx { id: string; reference: string; amount: string; currency: string; status: string; createdAt: string; failureReason: string | null; course: { id: string; title: string; slug: string } }

export default function PurchasesPage() {
  const q = useQuery({ queryKey: ['payments', 'mine'], queryFn: () => get<Trx[]>('/payments/mine') });
  return (
    <div className={a.stack}>
      <PageHead title="Purchases" subtitle="Every payment attempt, including ones that did not complete." />
      {q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <DataTable
          loading={q.isLoading}
          rows={q.data}
          rowKey={(t) => t.id}
          empty="No purchases yet"
          columns={[
            { key: 'course', header: 'Course', render: (t) => <Cell primary={<Link href={`/courses/${t.course.slug}`}>{t.course.title}</Link>} secondary={t.failureReason ?? undefined} /> },
            { key: 'ref', header: 'Reference', render: (t) => <span className={a.mono}>{t.reference}</span> },
            { key: 'date', header: 'Date', render: (t) => dateTime(t.createdAt) },
            { key: 'amount', header: 'Amount', numeric: true, render: (t) => amount(Number(t.amount), t.currency) },
            { key: 'status', header: 'Status', render: (t) => <StatusPill status={t.status} /> },
          ]}
        />
      )}
    </div>
  );
}
