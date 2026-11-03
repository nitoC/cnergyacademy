'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useCan } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Cell, DataTable } from '@/components/ui/Table';
import a from '../../../app.module.scss';
import type { EditorCourse } from './types';

export function PricingTab({ course }: { course: EditorCourse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const pending = course.priceProposals.find((p) => p.status === 'PENDING');
  const propose = useMutation({
    mutationFn: () => post(`/creator/courses/${course.id}/price-proposals`, { amount: Number(amount), note: note || undefined }),
    onSuccess: () => {
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['editor', course.id] });
      toast('Price proposal sent for approval');
    },
  });
  return (
    <div className={a.stack}>
      <Panel>
        <dl className={a.dl}>
          <dt>Approved price</dt>
          <dd>{course.approvedPrice ? money(course.approvedPrice, course.currency) : 'Free (no approved price)'}</dd>
          <dt>Pending proposal</dt>
          <dd>{pending ? `${money(pending.amount, pending.currency)} · sent ${date(pending.createdAt)}` : 'None'}</dd>
        </dl>
        {course.readiness.needsApprovedPrice && <div style={{ marginTop: 14 }}><Callout>This course has premium modules but no approved price, so it cannot be published yet.</Callout></div>}
      </Panel>
      {can('pricing.propose') && course.status !== 'ARCHIVED' && (
        <Panel>
          <form className={a.formGrid} onSubmit={(e) => { e.preventDefault(); propose.mutate(); }}>
            <h2 className={`${a.sectionTitle} ${a.full}`}>Propose a price</h2>
            {propose.error && <div className={a.full}><Callout tone="danger">{errorMessage(propose.error)}</Callout></div>}
            <TextField label={`Amount (${course.currency})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} required hint="0 makes the course free" />
            <TextField label="Note for the reviewer" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            <div className={a.full}>
              <Button type="submit" variant="primary" loading={propose.isPending} disabled={amount === ''}>{pending ? 'Replace pending proposal' : 'Send for approval'}</Button>
            </div>
          </form>
        </Panel>
      )}
      <section>
        <h2 className={a.sectionTitle}>Price history</h2>
        <DataTable
          rows={course.priceProposals}
          rowKey={(p) => p.id}
          empty="No price proposals yet"
          columns={[
            { key: 'a', header: 'Amount', render: (p) => <Cell primary={money(p.amount, p.currency)} secondary={p.note ?? undefined} /> },
            { key: 'by', header: 'Proposed', render: (p) => <Cell primary={p.proposedBy.fullName} secondary={date(p.createdAt)} /> },
            { key: 's', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
            { key: 'd', header: 'Decision', render: (p) => (p.decidedBy ? <Cell primary={p.decidedBy.fullName} secondary={p.decisionNote ?? date(p.decidedAt)} /> : '—') },
          ]}
        />
      </section>
    </div>
  );
}
