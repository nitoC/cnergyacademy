import { Suspense } from 'react';
import { VerifyEmail } from './VerifyEmail';

export const metadata = { title: 'Confirm your email' };
export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
