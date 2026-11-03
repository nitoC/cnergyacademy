'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { date } from '@/lib/format';
import { ME_KEY, useMe } from '@/features/auth/session';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, LoadingBlock, Panel, StatusPill } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';
import { PageHead } from '../PageHead';
import a from '../app.module.scss';

interface Application { id: string; headline: string; status: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null }

export default function BecomeCreator() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['creator-applications'], queryFn: () => get<Application[]>('/creator-applications/mine') });
  const [form, setForm] = useState({ headline: '', expertise: '', portfolioUrl: '', motivation: '' });
  const submit = useMutation({
    mutationFn: () => post('/creator-applications', { ...form, portfolioUrl: form.portfolioUrl || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-applications'] });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
  if (!me || !apps.data) return <LoadingBlock />;
  if (me.roles.includes('CREATOR'))
    return (
      <Callout tone="forest">
        You are an approved creator. <ButtonLink size="sm" href="/creator">Open the creator workspace</ButtonLink>
      </Callout>
    );
  const pending = apps.data.find((x) => x.status === 'PENDING');

  return (
    <div className={a.stack} style={{ maxWidth: 820 }}>
      <PageHead title="Teach on Genuslab" subtitle="Creators are reviewed by our team before they can publish. Tell us what you would teach and why you are the person to teach it." />
      {apps.data.length > 0 && (
        <ul className={a.queue}>
          {apps.data.map((x) => (
            <li key={x.id} className={a.queueItem}>
              <div>
                <span style={{ color: 'var(--ink-0)' }}>{x.headline}</span>
                <div className={a.muted}>Submitted {date(x.createdAt)}{x.reviewNote ? ` · “${x.reviewNote}”` : ''}</div>
              </div>
              <StatusPill status={x.status} />
            </li>
          ))}
        </ul>
      )}
      {pending ? (
        <Callout>Your application is under review. We will notify you when there is a decision.</Callout>
      ) : !me.emailVerified ? (
        <Callout>Confirm your email address before applying.</Callout>
      ) : (
        <Panel>
          <form className={a.formGrid} onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
            {submit.error && <div className={a.full}><Callout tone="danger">{errorMessage(submit.error)}</Callout></div>}
            <div className={a.full}><TextField label="Headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Security engineer teaching practical network defence" required minLength={5} maxLength={140} /></div>
            <div className={a.full}><TextArea label="Your expertise" value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} required minLength={10} hint="Experience, credentials and what you have taught before" /></div>
            <div className={a.full}><TextField label="Portfolio or profile link" type="url" value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} placeholder="https://" /></div>
            <div className={a.full}><TextArea label="What would you teach, and why?" value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} required minLength={30} rows={6} hint="At least 30 characters" /></div>
            <div className={a.full}><Button type="submit" variant="primary" loading={submit.isPending}>Submit application</Button></div>
          </form>
        </Panel>
      )}
    </div>
  );
}
