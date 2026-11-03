import { Fragment, type ReactNode } from 'react';

/**
 * Renders the tiny inline syntax allowed in lesson text — **bold**, *italic*,
 * `code` and [label](https://url) — as React elements. Text is never
 * injected as HTML, and links are restricted to http(s).
 */
const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function renderInline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2];
      if (/^https?:\/\//i.test(href)) {
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {link[1]}
          </a>
        );
      }
      return <Fragment key={i}>{link[1]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
