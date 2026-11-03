import { isSafeUrl } from '../common/util';

/**
 * Structured lesson content. Lessons are stored as an ordered list of typed
 * blocks — never HTML — and rendered by the web app as React elements, so
 * user content cannot inject markup or script. Inline formatting inside text
 * is limited to **bold**, *italic*, `code` and [label](https://url), parsed
 * by the renderer.
 */
export type LessonBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; style: 'bullet' | 'number'; items: string[] }
  | { type: 'image'; url: string; alt: string; caption?: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'callout'; tone: 'note' | 'tip' | 'warning'; title?: string; text: string }
  | { type: 'resource'; title: string; url: string; description?: string };

export class LessonContentError extends Error {}

const MAX_BLOCKS = 300;
const str = (v: unknown, field: string, max: number, required = true): string => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new LessonContentError(`${field} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new LessonContentError(`${field} must be text`);
  if (v.length > max) throw new LessonContentError(`${field} is longer than ${max} characters`);
  // Strip control characters other than tab/newline.
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
};
const url = (v: unknown, field: string) => {
  const u = str(v, field, 2000);
  if (!isSafeUrl(u)) throw new LessonContentError(`${field} must be an http(s) URL`);
  return u;
};

/** Validates and normalises content, dropping any unknown properties. */
export function normaliseLessonContent(input: unknown): LessonBlock[] {
  if (!Array.isArray(input)) throw new LessonContentError('Content must be a list of blocks');
  if (input.length > MAX_BLOCKS) throw new LessonContentError(`A lesson can contain at most ${MAX_BLOCKS} blocks`);
  return input.map((raw, i): LessonBlock => {
    if (!raw || typeof raw !== 'object') throw new LessonContentError(`Block ${i + 1} is invalid`);
    const b = raw as Record<string, unknown>;
    const at = `Block ${i + 1}`;
    switch (b.type) {
      case 'heading':
        return { type: 'heading', level: b.level === 3 ? 3 : 2, text: str(b.text, `${at} heading`, 200) };
      case 'paragraph':
        return { type: 'paragraph', text: str(b.text, `${at} paragraph`, 10_000) };
      case 'list': {
        if (!Array.isArray(b.items) || !b.items.length) throw new LessonContentError(`${at} list needs at least one item`);
        if (b.items.length > 100) throw new LessonContentError(`${at} list has too many items`);
        return { type: 'list', style: b.style === 'number' ? 'number' : 'bullet', items: b.items.map((it, j) => str(it, `${at} item ${j + 1}`, 2000)) };
      }
      case 'image':
        return { type: 'image', url: url(b.url, `${at} image URL`), alt: str(b.alt, `${at} alt text`, 300), caption: str(b.caption, `${at} caption`, 300, false) || undefined };
      case 'code':
        return { type: 'code', language: str(b.language, `${at} language`, 30, false) || 'text', code: str(b.code, `${at} code`, 20_000) };
      case 'callout': {
        const tone = b.tone === 'tip' || b.tone === 'warning' ? b.tone : 'note';
        return { type: 'callout', tone, title: str(b.title, `${at} title`, 120, false) || undefined, text: str(b.text, `${at} text`, 4000) };
      }
      case 'resource':
        return { type: 'resource', title: str(b.title, `${at} title`, 200), url: url(b.url, `${at} URL`), description: str(b.description, `${at} description`, 500, false) || undefined };
      default:
        throw new LessonContentError(`${at} has an unsupported type`);
    }
  });
}

export function estimateReadingMinutes(blocks: LessonBlock[]): number {
  let words = 0;
  for (const b of blocks) {
    if ('text' in b && b.text) words += b.text.split(/\s+/).length;
    if (b.type === 'list') words += b.items.join(' ').split(/\s+/).length;
    if (b.type === 'code') words += Math.ceil(b.code.split('\n').length * 3);
  }
  return Math.max(1, Math.round(words / 200));
}
