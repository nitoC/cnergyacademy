'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** List filters live in the URL so views are shareable and survive reloads. */
export function useListState<K extends string>(keys: K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const page = Number(params.get('page') ?? 1);
  const set = (patch: Partial<Record<K | 'page', string | number>>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined || v === null) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return { values, page, set };
}

/** Debounced text input bound to a URL param. */
export function useDebouncedSearch(value: string, onCommit: (v: string) => void, delay = 300) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // URL changed elsewhere (back button, clear filters): adopt it during render.
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onCommit(text), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return [text, setText] as const;
}

export function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null)) as Partial<T>;
}
