'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import s from '../public.module.scss';

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <div className={s.container}>
      <form
        className={s.verifyBox}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/verify/${encodeURIComponent(code.trim())}`);
        }}
      >
        <h1 className={s.pageTitle}>Verify a certificate</h1>
        <p className={s.detailLead}>Enter the verification code or serial number printed on the certificate.</p>
        <TextField label="Verification code or serial" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SEEDVERIFY01 or GA-2026-SEED01" required maxLength={40} />
        <div>
          <Button type="submit" variant="primary">Check certificate</Button>
        </div>
      </form>
    </div>
  );
}
