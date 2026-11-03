'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/features/auth/session';
import { ButtonLink } from '@/components/ui/Button';
import { Wordmark } from './Wordmark';
import s from './nav.module.scss';

const LINKS = [
  { href: '/courses', label: 'Courses' },
  { href: '/roadmaps', label: 'Roadmaps' },
  { href: '/verify', label: 'Verify a certificate' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  return (
    <header className={s.siteHeader}>
      <div className={s.siteInner}>
        <Wordmark />
        <nav className={s.siteNav} aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={s.siteActions}>
          {isLoading ? null : me ? (
            <ButtonLink href="/learn" variant="primary" size="sm">
              My learning
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="tertiary" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" variant="primary" size="sm">
                Start learning
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <span>© {new Date().getFullYear()} Cnergy Academy</span>
        <nav aria-label="Footer">
          <Link href="/courses">Courses</Link>
          <Link href="/roadmaps">Roadmaps</Link>
          <Link href="/verify">Verify a certificate</Link>
          <Link href="/become-a-creator">Teach with us</Link>
        </nav>
      </div>
    </footer>
  );
}
