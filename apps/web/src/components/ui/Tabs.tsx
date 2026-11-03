'use client';
import Link from 'next/link';
import s from './ui.module.scss';

export function LinkTabs({ tabs, current }: { tabs: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav className={s.tabs} aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? 'page' : undefined}>
          {t.label}
          {t.count !== undefined && <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function ButtonTabs<V extends string>({ tabs, value, onChange, label }: { tabs: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void; label: string }) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
