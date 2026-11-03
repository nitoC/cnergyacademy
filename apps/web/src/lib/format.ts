export function money(amount: number | null | undefined, currency = 'NGN') {
  if (!amount) return 'Free';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

export function amount(value: number | null | undefined, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value ?? 0);
}

export function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function date(value: string | Date | null | undefined, style: 'medium' | 'long' = 'medium') {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: style }).format(new Date(value));
}

export function dateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function relative(value: string | Date | null | undefined) {
  if (!value) return '—';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date(value);
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const DIFFICULTY_LABEL: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

export const ACCESS_LABEL: Record<string, string> = {
  FREE: 'Free',
  PREMIUM: 'Premium',
  PREREQUISITE_QUIZ: 'Prerequisite quiz',
  PREMIUM_AND_PREREQUISITE_QUIZ: 'Premium + prerequisite',
};
