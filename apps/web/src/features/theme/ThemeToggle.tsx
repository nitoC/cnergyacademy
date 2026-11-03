'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { readPreference, setPreference, subscribe, type ThemePreference } from './theme';
import s from './theme.module.scss';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light theme', icon: <Sun size={14} /> },
  { value: 'dark', label: 'Dark theme', icon: <Moon size={14} /> },
  { value: 'system', label: 'Match system theme', icon: <Monitor size={14} /> },
];

/** Light / dark / system switch. The preference is stored in this browser only. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference);
  return (
    <div className={s.toggle} role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPreference(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
