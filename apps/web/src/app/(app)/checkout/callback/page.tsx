import { Suspense } from 'react';
import { CheckoutCallback } from './CheckoutCallback';

export const metadata = { title: 'Confirming payment' };
export default function Page() {
  return (
    <Suspense>
      <CheckoutCallback />
    </Suspense>
  );
}
