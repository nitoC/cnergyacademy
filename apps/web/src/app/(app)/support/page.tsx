import { Suspense } from 'react';
import { SupportList } from './SupportList';

export const metadata = { title: 'Questions' };
export default function Page() {
  return (
    <Suspense>
      <SupportList />
    </Suspense>
  );
}
