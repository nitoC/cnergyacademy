'use client';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import s from './ui.module.scss';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'amber';
type Size = 'sm' | 'md' | 'lg';

function cls(variant: Variant, size: Size, block?: boolean, extra?: string) {
  return [s.btn, s[variant], size !== 'md' && s[size], block && s.block, extra].filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, block, icon, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cls(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={s.spinner} aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  children,
  className,
  ...rest
}: { href: string; variant?: Variant; size?: Size; block?: boolean; icon?: ReactNode; children: ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link href={href} className={cls(variant, size, block, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
