import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './app.module.scss';

export function PageHead({ title, subtitle, crumbs, actions }: { title: ReactNode; subtitle?: ReactNode; crumbs?: { href: string; label: string }[]; actions?: ReactNode }) {
  return (
    <header className={s.head}>
      <div>
        {crumbs && (
          <nav className={s.crumbs} aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && ' / '}
                <Link href={c.href}>{c.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 className={s.title}>{title}</h1>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className={s.facts}>
      {items.map((f) => (
        <div key={f.label} className={s.fact}>
          <strong>{f.value}</strong>
          <span>{f.label}</span>
        </div>
      ))}
    </div>
  );
}
