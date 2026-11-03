import Link from 'next/link';
import s from './nav.module.scss';

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={s.wordmark} aria-label="Cnergy Academy home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <path d="M3 18 C 7 18, 6 11, 11 11 S 15 4, 19 4" fill="none" stroke="var(--amber-300)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="0.1 3.4" />
        <circle cx="3" cy="18" r="2.3" fill="var(--forest-400)" />
        <circle cx="19" cy="4" r="2.3" fill="none" stroke="var(--ink-0)" strokeWidth="1.4" />
      </svg>
      Cnergy <em>Academy</em>
    </Link>
  );
}
