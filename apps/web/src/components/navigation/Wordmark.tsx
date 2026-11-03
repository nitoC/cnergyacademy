import Link from 'next/link';
import s from './nav.module.scss';

/** Schutech mark: an S drawn as a trail — a start point, a winding path, a summit ring. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={s.mark}>
      <path d="M18 5.5 C 13 3, 5.5 4.5, 6.5 9 C 7.3 12.4, 17 11.6, 17.5 15.5 C 18 19.6, 10 21, 5.5 18.5" fill="none" stroke="var(--logo-trail)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 5.5 C 13 3, 5.5 4.5, 6.5 9 C 7.3 12.4, 17 11.6, 17.5 15.5 C 18 19.6, 10 21, 5.5 18.5" fill="none" stroke="var(--logo-dash)" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="0.1 2.6" />
      <circle cx="5.5" cy="18.5" r="2.4" fill="var(--forest-400)" />
      <circle cx="18" cy="5.5" r="2.4" fill="var(--surface-0)" stroke="var(--amber-300)" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={s.wordmark} aria-label="Schutech Academy home">
      <LogoMark />
      Schutech <em>Academy</em>
    </Link>
  );
}
