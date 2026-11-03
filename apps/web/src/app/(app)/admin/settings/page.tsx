'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, get, patch } from '@/lib/api';
import { relative } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, LoadingBlock, Panel, useToast } from '@/components/ui/Feedback';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { PageHead } from '../../PageHead';
import a from '../../app.module.scss';

interface Setting { key: string; type: string; group: string; label: string; help?: string; options?: string[]; value: unknown; updatedAt: string | null }
interface Resp { settings: Setting[]; environment: { paymentProvider: string; paystackConfigured: boolean; paymentCallbackUrl: string; mailTransport: string; storageDriver: string } }

export default function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => get<Resp>('/admin/settings') });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [seen, setSeen] = useState<Resp | undefined>();
  if (q.data && q.data !== seen) {
    setSeen(q.data);
    setDraft(Object.fromEntries(q.data.settings.map((s) => [s.key, s.value])));
  }
  const changed = q.data ? Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(q.data!.settings.find((s) => s.key === k)?.value) !== JSON.stringify(v))) : {};
  const save = useMutation({ mutationFn: () => patch<{ updated: number }>('/admin/settings', { values: changed }), onSuccess: (r) => { toast(`${r.updated} settings updated`); qc.invalidateQueries({ queryKey: ['admin', 'settings'] }); } });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <LoadingBlock />;
  const groups = [...new Set(q.data.settings.map((s) => s.group))];
  const env = q.data.environment;

  const field = (s: Setting) => {
    const v = draft[s.key];
    switch (s.type) {
      case 'boolean':
        return <Checkbox label={s.label} checked={!!v} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })} />;
      case 'enum':
        return <Select label={s.label} value={String(v)} onChange={(x) => setDraft({ ...draft, [s.key]: x })} options={(s.options ?? []).map((o) => ({ value: o, label: o.toLowerCase().replace(/_/g, ' ') }))} />;
      case 'text':
        return <TextArea label={s.label} value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />;
      case 'percent-or-null':
        return <TextField label={s.label} inputMode="decimal" value={v === null || v === undefined ? '' : String(v)} placeholder="Not set" hint={s.help} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value === '' ? null : Number(e.target.value) })} />;
      default:
        return <TextField label={s.label} value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />;
    }
  };

  return (
    <div className={a.stack} style={{ maxWidth: 860 }}>
      <PageHead title="Platform settings" subtitle="Every change is validated and recorded in the audit log." actions={<Button variant="primary" loading={save.isPending} disabled={!Object.keys(changed).length} onClick={() => save.mutate()}>Save {Object.keys(changed).length || ''} changes</Button>} />
      {save.error && <Callout tone="danger">{errorMessage(save.error)}</Callout>}
      <Panel>
        <h2 className={a.sectionTitle}>Payment configuration</h2>
        <dl className={a.dl}>
          <dt>Provider</dt><dd>{env.paymentProvider === 'paystack' ? 'Paystack' : 'Sandbox (development only)'}</dd>
          <dt>Secret key</dt><dd>{env.paymentProvider === 'paystack' ? (env.paystackConfigured ? 'Configured in environment' : 'Missing') : 'Not required for sandbox'}</dd>
          <dt>Callback URL</dt><dd className={a.mono}>{env.paymentCallbackUrl}</dd>
          <dt>Webhook URL</dt><dd className={a.mono}>/api/v1/payments/webhook</dd>
          <dt>Mail transport</dt><dd>{env.mailTransport}</dd>
          <dt>Media storage</dt><dd>{env.storageDriver}</dd>
        </dl>
        <p className={a.muted} style={{ marginTop: 12 }}>Keys and providers are set through environment variables and are never stored in or shown by the application.</p>
      </Panel>
      {groups.map((g) => (
        <Panel key={g}>
          <h2 className={a.sectionTitle}>{g}</h2>
          <div className={a.stackSm}>
            {q.data.settings.filter((s) => s.group === g).map((s) => (
              <div key={s.key}>
                {field(s)}
                {s.updatedAt && <span className={a.muted} style={{ fontSize: '0.72rem' }}>Changed {relative(s.updatedAt)}</span>}
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
