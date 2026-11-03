import Link from 'next/link';
import { serverGet } from '@/lib/server-api';
import { date } from '@/lib/format';
import s from '../../public.module.scss';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificate verification' };

interface Verification {
  valid: boolean;
  found: boolean;
  serial?: string;
  learnerName?: string;
  courseTitle?: string;
  issuerName?: string;
  issuedAt?: string;
  status?: string;
  revokedAt?: string | null;
}

export default async function VerifyResult({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = await serverGet<Verification>(`/certificates/verify/${encodeURIComponent(code)}`);
  const v = res.ok ? res.data : null;
  return (
    <div className={s.container}>
      <div className={s.verifyBox}>
        {!v ? (
          <div className={s.invalid}><h2>Verification unavailable</h2><small>Please try again shortly.</small></div>
        ) : !v.found ? (
          <div className={s.invalid}>
            <h2>No certificate found</h2>
            <small>No certificate matches “{code}”. Check the code and try again.</small>
          </div>
        ) : v.valid ? (
          <div className={s.certificate}>
            <small>VERIFIED CERTIFICATE · {v.serial}</small>
            <h2>{v.learnerName}</h2>
            <span>completed</span>
            <strong style={{ fontSize: '1.2rem' }}>{v.courseTitle}</strong>
            <small>Issued {date(v.issuedAt, 'long')} by {v.issuerName}</small>
          </div>
        ) : (
          <div className={s.invalid}>
            <h2>Certificate revoked</h2>
            <small>Serial {v.serial} was revoked on {date(v.revokedAt, 'long')} and is no longer valid.</small>
          </div>
        )}
        <Link href="/verify" style={{ color: 'var(--ink-2)', fontSize: '0.9rem' }}>← Check another certificate</Link>
      </div>
    </div>
  );
}
