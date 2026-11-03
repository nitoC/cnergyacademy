export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'schutech-theme';

/**
 * Runs in <head> before first paint (see app/layout.tsx), so the saved theme
 * is applied without a flash. Kept dependency-free and tiny on purpose.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var t=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const listeners = new Set<() => void>();

export function setPreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage unavailable: still apply for this page view */
  }
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const onSystem = () => {
    if (readPreference() === 'system') document.documentElement.setAttribute('data-theme', resolveTheme('system'));
    listener();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    document.documentElement.setAttribute('data-theme', resolveTheme(readPreference()));
    listener();
  };
  media.addEventListener('change', onSystem);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystem);
    window.removeEventListener('storage', onStorage);
  };
}
