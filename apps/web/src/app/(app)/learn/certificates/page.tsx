'use client';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { get } from '@/lib/api';
import { date } from '@/lib/format';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingBlock, StatusPill } from '@/components/ui/Feedback';
import { Cell, DataTable } from '@/components/ui/Table';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Cert { id: string; serial: string; verificationCode: string; courseTitle: string; issuerName: string; issuedAt: string; status: string; revokeReason: string | null }

export default function CertificatesPage() {
  const q = useQuery({ queryKey: ['certificates', 'mine'], queryFn: () => get<Cert[]>('/certificates/mine') });
  return (
    <div className={a.stack}>
      <PageHead title="Certificates" subtitle="Anyone can confirm a certificate using its verification code — no account needed." />
      {q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingBlock />
      ) : q.data.length === 0 ? (
        <EmptyState title="No certificates yet" action={<ButtonLink href="/learn">Continue learning</ButtonLink>}>Complete every requirement of a course to earn one.</EmptyState>
      ) : (
        <DataTable
          rows={q.data}
          rowKey={(c) => c.id}
          columns={[
            { key: 'course', header: 'Course', render: (c) => <Cell primary={c.courseTitle} secondary={c.issuerName} /> },
            { key: 'serial', header: 'Serial', render: (c) => <span className={a.mono}>{c.serial}</span> },
            { key: 'code', header: 'Verification', render: (c) => <a className={a.link} href={`/verify/${c.verificationCode}`}>{c.verificationCode}</a> },
            { key: 'issued', header: 'Issued', render: (c) => date(c.issuedAt) },
            { key: 'status', header: 'Status', render: (c) => <span title={c.revokeReason ?? undefined}><StatusPill status={c.status} /></span> },
            {
              key: 'pdf',
              header: '',
              render: (c) =>
                c.status === 'VALID' ? (
                  <a className={a.link} href={`/api/v1/certificates/${c.id}/pdf`} download>
                    <Download size={14} style={{ verticalAlign: '-2px' }} /> PDF
                  </a>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
