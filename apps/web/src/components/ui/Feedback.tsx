'use client';
import { AlertTriangle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import s from './ui.module.scss';

type Tone = 'neutral' | 'forest' | 'amber' | 'terracotta' | 'slate';

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${s.pill} ${s[`tone-${tone}`]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  PUBLISHED: 'forest', APPROVED: 'slate', SUBMITTED: 'amber', DRAFT: 'neutral', REJECTED: 'terracotta', ARCHIVED: 'neutral',
  SUCCESSFUL: 'forest', PENDING: 'amber', FAILED: 'terracotta', CANCELLED: 'neutral', REFUNDED: 'slate',
  ACTIVE: 'forest', PENDING_VERIFICATION: 'amber', SUSPENDED: 'terracotta', DEACTIVATED: 'neutral',
  VALID: 'forest', REVOKED: 'terracotta', OPEN: 'amber', WAITING_FOR_RESPONSE: 'amber', ANSWERED: 'forest', RESOLVED: 'neutral',
  SALE: 'forest', REFUND: 'terracotta', CREATOR_EARNING: 'slate', PLATFORM_REVENUE: 'slate', ADJUSTMENT: 'amber',
  SUCCESS: 'forest', DENIED: 'terracotta', WITHDRAWN: 'neutral', PASSED: 'forest',
};
const STATUS_LABEL: Record<string, string> = { WAITING_FOR_RESPONSE: 'Waiting', PENDING_VERIFICATION: 'Unverified' };

export function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <Pill tone={STATUS_TONE[status] ?? 'neutral'}>{label}</Pill>;
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label ?? 'Progress'}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error?: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'We could not load this.';
  return (
    <div className={s.errorState} role="alert">
      <AlertTriangle size={20} aria-hidden />
      <p>{message}</p>
      {retry && (
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number | string; width?: number | string; style?: React.CSSProperties }) {
  return <div className={s.skeleton} style={{ height, width, ...style }} aria-hidden />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 28 : 18} width={i === 0 ? '40%' : `${90 - i * 8}%`} />
      ))}
    </div>
  );
}

export function Callout({ tone = 'amber', children }: { tone?: 'amber' | 'danger' | 'forest'; children: ReactNode }) {
  const cls = tone === 'danger' ? s.calloutDanger : tone === 'forest' ? s.calloutForest : '';
  return <div className={`${s.callout} ${cls}`}>{children}</div>;
}

export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`${s.panel} ${className ?? ''}`} style={style}>
      {children}
    </section>
  );
}

/* Dialog built on the native <dialog> element (focus trap and Esc for free). */
export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} onCancel={onClose} aria-labelledby="dialog-title">
      {open && (
        <>
          <div className={s.dialogHead}>
            <h2 id="dialog-title">{title}</h2>
            <Button variant="tertiary" size="sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
          <div className={s.dialogBody}>
            {children}
            {actions && <div className={s.dialogActions}>{actions}</div>}
          </div>
        </>
      )}
    </dialog>
  );
}

/* Toasts */
interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}
const ToastCtx = createContext<(message: string, tone?: 'success' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={s.toasts} aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`${s.toast} ${t.tone === 'error' ? s.toastError : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
