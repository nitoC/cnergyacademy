import { Suspense } from 'react';
import { SandboxCheckout } from './SandboxCheckout';

export const metadata = { title: 'Sandbox payment' };
export default function Page() {
  return (
    <Suspense>
      <SandboxCheckout />
    </Suspense>
  );
}
