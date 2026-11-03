'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, get, patch } from '@/lib/api';
import { amount, date, dateTime, relative } from '@/lib/format';
import { useCan, useMe } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Cell, DataTable } from '@/components/ui/Table';
import { PageHead } from '../../../PageHead';
import a from '../../../app.module.scss';

interface Detail {
  id: string; email: string; fullName: string; status: string; emailVerifiedAt: string | null; lastLoginAt: string | null; lastActiveAt: string | null; createdAt: string;
  roles: { grantedAt: string; role: { key: string; name: string }; grantedBy: { fullName: string } | null }[];
  _count: { enrollments: number; courses: number; certificates: number; transactions: number; supportThreads: number };
  enrollments: { enrolledAt: string; completedAt: string | null; lastActivityAt: string; course: { id: string; title: string } }[];
  transactions: { id: string; reference: string; amount: string; currency: string; status: string; createdAt: string; course: { title: string } }[];
  activity: { id: string; action: string; outcome: string; createdAt: string; actor: { fullName: string } | null }[];
  applications: { id: string; headline: string; status: string; createdAt: string }[];
}
const ROLES = ['CREATOR', 'MENTOR', 'ADMIN'] as const;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => get<Detail>(`/admin/users/${id}`) });
  const [roles, setRoles] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [seen, setSeen] = useState<Detail | undefined>();
  if (q.data && q.data !== seen) {
    setSeen(q.data);
    setRoles(q.data.roles.map((r) => r.role.key));
    setStatus(q.data.status);
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
  const saveRoles = useMutation({ mutationFn: () => patch(`/admin/users/${id}/roles`, { roles, reason: reason || undefined }), onSuccess: () => { toast('Roles updated'); setReason(''); refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });
  const saveStatus = useMutation({ mutationFn: () => patch(`/admin/users/${id}/status`, { status, reason: reason || undefined }), onSuccess: () => { toast('Account status updated'); refresh(); }, onError: (e) => toast(errorMessage(e), 'error') });

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock />;
  const u = q.data;
  const self = me?.id === u.id;

  return (
    <div className={a.stack}>
      <PageHead crumbs={[{ href: '/admin/users', label: 'Users' }]} title={u.fullName} subtitle={<span className={a.row}>{u.email} <StatusPill status={u.status} /></span>} />
      {self && <Callout>This is your own account. Role and status changes must be made by another administrator.</Callout>}
      <div className={a.split}>
        <div className={a.stack}>
          <Panel>
            <dl className={a.dl}>
              <dt>Joined</dt><dd>{date(u.createdAt, 'long')}</dd>
              <dt>Email verified</dt><dd>{u.emailVerifiedAt ? date(u.emailVerifiedAt) : 'Not yet'}</dd>
              <dt>Last sign-in</dt><dd>{dateTime(u.lastLoginAt)}</dd>
              <dt>Last active</dt><dd>{relative(u.lastActiveAt)}</dd>
              <dt>Totals</dt><dd>{u._count.enrollments} enrolments · {u._count.certificates} certificates · {u._count.courses} courses authored · {u._count.supportThreads} questions</dd>
            </dl>
          </Panel>
          <section>
            <h2 className={a.sectionTitle}>Enrolments</h2>
            <DataTable rows={u.enrollments} rowKey={(e) => e.course.id} empty="No enrolments" columns={[
              { key: 'c', header: 'Course', render: (e) => e.course.title },
              { key: 'e', header: 'Enrolled', render: (e) => date(e.enrolledAt) },
              { key: 'a', header: 'Last activity', render: (e) => relative(e.lastActivityAt) },
              { key: 'd', header: 'Completed', render: (e) => (e.completedAt ? date(e.completedAt) : '—') },
            ]} />
          </section>
          <section>
            <h2 className={a.sectionTitle}>Payments</h2>
            <DataTable rows={u.transactions} rowKey={(t) => t.id} empty="No payments" columns={[
              { key: 'r', header: 'Reference', render: (t) => <Cell primary={<span className={a.mono}>{t.reference}</span>} secondary={t.course.title} /> },
              { key: 'a', header: 'Amount', numeric: true, render: (t) => amount(Number(t.amount), t.currency) },
              { key: 's', header: 'Status', render: (t) => <StatusPill status={t.status} /> },
              { key: 'd', header: 'Date', render: (t) => date(t.createdAt) },
            ]} />
          </section>
          <section>
            <h2 className={a.sectionTitle}>Activity</h2>
            <ul className={a.activity}>
              {u.activity.map((e) => (
                <li key={e.id}><time>{relative(e.createdAt)}</time><span><span className={a.mono}>{e.action}</span> by {e.actor?.fullName ?? 'system'} {e.outcome !== 'SUCCESS' && <StatusPill status={e.outcome} />}</span></li>
              ))}
            </ul>
          </section>
        </div>
        <aside className={a.stack}>
          {can('roles.assign') && (
            <Panel>
              <h2 className={a.sectionTitle}>Roles</h2>
              <div className={a.stackSm}>
                <Checkbox label="Learner (always)" checked disabled />
                {ROLES.map((r) => (
                  <Checkbox key={r} label={r === 'ADMIN' ? 'Administrator' : r.charAt(0) + r.slice(1).toLowerCase()} checked={roles.includes(r)} disabled={self} onChange={(e) => setRoles((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
                ))}
                <TextField label="Reason (recorded in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={self} />
                <Button variant="primary" loading={saveRoles.isPending} disabled={self} onClick={() => saveRoles.mutate()}>Save roles</Button>
              </div>
            </Panel>
          )}
          {can('users.manage') && (
            <Panel>
              <h2 className={a.sectionTitle}>Account status</h2>
              <div className={a.stackSm}>
                <Select label="Status" value={status} disabled={self} onChange={setStatus} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'PENDING_VERIFICATION', label: 'Unverified' }, { value: 'SUSPENDED', label: 'Suspended — signs out everywhere' }, { value: 'DEACTIVATED', label: 'Deactivated' }]} />
                <Button variant={status === 'SUSPENDED' || status === 'DEACTIVATED' ? 'danger' : 'secondary'} loading={saveStatus.isPending} disabled={self || status === u.status} onClick={() => saveStatus.mutate()}>Apply status</Button>
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
