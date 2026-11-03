import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import s from './ui.module.scss';

interface FieldShell {
  label: string;
  hint?: ReactNode;
  error?: string;
  hideLabel?: boolean;
}

export function FieldShell({ id, label, hint, error, hideLabel, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : s.label}>
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={s.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className={s.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldShell & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, hideLabel, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        ref={ref}
        id={fid}
        className={s.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, hideLabel, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea
        ref={ref}
        id={fid}
        className={s.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export function Checkbox({ label, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={s.checkbox}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
