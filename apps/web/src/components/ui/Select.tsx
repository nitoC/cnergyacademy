'use client';
import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FieldShell } from './Field';
import s from './ui.module.scss';

export interface Option<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

interface Props<V extends string> {
  label: string;
  value: V | '' | null | undefined;
  options: Option<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
}

/** Accessible custom listbox (keyboard: arrows, Home/End, Enter, Escape, type-ahead). */
export function Select<V extends string>({ label, value, options, onChange, placeholder = 'Choose…', hint, error, hideLabel, disabled, id }: Props<V>) {
  const auto = useId();
  const fid = id ?? auto;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <div className={s.select} ref={root}>
        <button
          ref={button}
          id={fid}
          type="button"
          role="combobox"
          className={s.selectButton}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${fid}-list`}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKey}
          aria-activedescendant={open ? `${fid}-opt-${active}` : undefined}
        >
          <span className={selected ? undefined : s.placeholder}>{selected?.label ?? placeholder}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {open && (
          <ul id={`${fid}-list`} role="listbox" className={s.menu} aria-label={label}>
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${fid}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                className={s.option}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
              >
                <span>
                  {o.label}
                  {o.hint && <small style={{ display: 'block', color: 'var(--ink-3)' }}>{o.hint}</small>}
                </span>
                {o.value === value && <Check size={14} aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}

export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: Option<V>[]; onChange: (v: V) => void; label: string }) {
  return (
    <div className={s.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
