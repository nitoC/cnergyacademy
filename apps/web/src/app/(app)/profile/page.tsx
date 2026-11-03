'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, patch, post } from '@/lib/api';
import { date } from '@/lib/format';
import { ME_KEY, RequireAuth, useMe } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { Callout, Panel, Pill, StatusPill, useToast } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { passwordRule } from '../../(auth)/register/RegisterForm';
import { PageHead } from '../PageHead';
import a from '../app.module.scss';

function ProfileInner() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [profile, setProfile] = useState({ fullName: '', displayName: '', bio: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwError, setPwError] = useState<string>();
  const [seen, setSeen] = useState<typeof me>();
  if (me && me !== seen) {
    setSeen(me);
    setProfile({ fullName: me.fullName, displayName: me.displayName ?? '', bio: me.bio ?? '' });
  }
  const save = useMutation({
    mutationFn: () => patch('/users/me', { fullName: profile.fullName, displayName: profile.displayName || undefined, bio: profile.bio }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast('Profile saved');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const change = useMutation({
    mutationFn: () => post('/auth/change-password', pw),
    onSuccess: () => {
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other sessions were signed out.');
    },
    onError: (e) => setPwError(errorMessage(e)),
  });
  const logoutAll = useMutation({ mutationFn: () => post<{ revoked: number }>('/auth/logout-all'), onSuccess: () => (window.location.href = '/login') });
  const resend = useMutation({ mutationFn: () => post('/auth/resend-verification'), onSuccess: () => toast('Verification email sent') });
  if (!me) return null;

  return (
    <div className={a.stack} style={{ maxWidth: 820 }}>
      <PageHead title="Profile & security" />
      <Panel>
        <dl className={a.dl}>
          <dt>Email</dt>
          <dd>
            {me.email} {me.emailVerified ? <Pill tone="forest">verified</Pill> : <Button size="sm" onClick={() => resend.mutate()} loading={resend.isPending}>Send verification email</Button>}
          </dd>
          <dt>Account</dt><dd><StatusPill status={me.status} /></dd>
          <dt>Roles</dt><dd>{me.roles.map((r) => r.charAt(0) + r.slice(1).toLowerCase()).join(', ')}</dd>
          <dt>Member since</dt><dd>{date(me.createdAt, 'long')}</dd>
        </dl>
      </Panel>
      <Panel>
        <form className={a.formGrid} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <h2 className={`${a.sectionTitle} ${a.full}`}>Public profile</h2>
          <TextField label="Full name" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} hint="Used on certificates issued from now on" required minLength={2} />
          <TextField label="Display name" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
          <div className={a.full}>
            <TextArea label="Bio" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} maxLength={1000} />
          </div>
          <div className={a.full}><Button type="submit" variant="primary" loading={save.isPending}>Save profile</Button></div>
        </form>
      </Panel>
      <Panel>
        <form
          className={a.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            const check = passwordRule.safeParse(pw.newPassword);
            if (!check.success) return setPwError(check.error.issues[0].message);
            setPwError(undefined);
            change.mutate();
          }}
        >
          <h2 className={`${a.sectionTitle} ${a.full}`}>Password</h2>
          {pwError && <div className={a.full}><Callout tone="danger">{pwError}</Callout></div>}
          <TextField label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
          <TextField label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
          <div className={a.full}><Button type="submit" loading={change.isPending}>Change password</Button></div>
        </form>
      </Panel>
      <Panel>
        <h2 className={a.sectionTitle}>Sessions</h2>
        <p className={a.muted} style={{ marginBottom: 12 }}>Signed in on a shared or lost device? Sign out everywhere, including here.</p>
        <Button variant="danger" onClick={() => logoutAll.mutate()} loading={logoutAll.isPending}>Sign out of all sessions</Button>
      </Panel>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
