'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { date } from '@/lib/format';
import { clean, useDebouncedSearch, useListState } from '@/features/administration/useListState';
import type { Paginated } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { Cell, DataTable, Pagination } from '@/components/ui/Table';
import { ButtonTabs } from '@/components/ui/Tabs';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Cert { id: string; serial: string; verificationCode: string; learnerName: string; courseTitle: string; issuedAt: string; status: string; revokeReason: string | null; revokedBy: { fullName: string } | null }

export default function AdminCertificates() {
  const { values, page, set } = useListState(['status', 'search']);
  const [text, setText] = useDebouncedSearch(values.search, (v) => set({ search: v }));
  const qc = useQueryClient();
  const toast = useToast();
  const [revoking, setRevoking] = useState<Cert | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'certificates', values, page], queryFn: () => get<Paginated<Cert>>('/admin/certificates', { ...clean(values), page }), placeholderData: keepPreviousData });
  const revoke = useMutation({ mutationFn: () => post(`/admin/certificates/${revoking!.id}/revoke`, { reason }), onSuccess: () => { toast('Certificate revoked'); setRevoking(null); setReason(''); qc.invalidateQueries({ queryKey: ['admin', 'certificates'] }); } });
  return (
    <div className={a.stack}>
      <PageHead title="Certificates" subtitle="Revocation is permanent, shown on the public verification page and recorded in the audit log." />
      <ButtonTabs label="Status" value={values.status || 'all'} onChange={(v) => set({ status: v === 'all' ? '' : v })} tabs={[{ value: 'all', label: 'All' }, { value: 'VALID', label: 'Valid' }, { value: 'REVOKED', label: 'Revoked' }]} />
      <div className={a.toolbar}><div className={a.grow}><TextField label="Search" placeholder="Serial, learner or course" type="search" value={text} onChange={(e) => setText(e.target.value)} /></div></div>
      <DataTable
        loading={q.isLoading}
        error={q.error}
        rows={q.data?.items}
        rowKey={(c) => c.id}
        empty="No certificates"
        columns={[
          { key: 's', header: 'Serial', render: (c) => <Cell primary={<span className={a.mono}>{c.serial}</span>} secondary={<a className={a.link} href={`/verify/${c.verificationCode}`} target="_blank">verify</a>} /> },
          { key: 'l', header: 'Learner', render: (c) => c.learnerName },
          { key: 'c', header: 'Course', render: (c) => c.courseTitle },
          { key: 'd', header: 'Issued', render: (c) => date(c.issuedAt) },
          { key: 'st', header: 'Status', render: (c) => <Cell primary={<StatusPill status={c.status} />} secondary={c.revokeReason ? `${c.revokeReason} — ${c.revokedBy?.fullName}` : undefined} /> },
          { key: 'a', header: '', render: (c) => (c.status === 'VALID' ? <Button size="sm" variant="tertiary" onClick={() => setRevoking(c)}>Revoke</Button> : null) },
        ]}
      />
      {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={(p) => set({ page: p })} />}
      <Dialog open={!!revoking} onClose={() => setRevoking(null)} title={`Revoke ${revoking?.serial}?`} actions={<><Button variant="tertiary" onClick={() => setRevoking(null)}>Cancel</Button><Button variant="danger" loading={revoke.isPending} disabled={reason.trim().length < 5} onClick={() => revoke.mutate()}>Revoke certificate</Button></>}>
        {revoke.error && <Callout tone="danger">{errorMessage(revoke.error)}</Callout>}
        <p>{revoking?.learnerName} · {revoking?.courseTitle}</p>
        <TextArea label="Reason (shown to the learner and recorded)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </div>
  );
}
