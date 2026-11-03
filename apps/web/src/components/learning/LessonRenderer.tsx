import { ArrowUpRight } from 'lucide-react';
import type { LessonBlock } from '@/types/api';
import { renderInline } from './inline';
import s from './lesson.module.scss';

const safe = (url: string) => /^https?:\/\//i.test(url) || url.startsWith('/api/v1/media/');

export function LessonRenderer({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <div className={s.body}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return b.level === 3 ? <h3 key={i}>{b.text}</h3> : <h2 key={i}>{b.text}</h2>;
          case 'paragraph':
            return <p key={i}>{renderInline(b.text)}</p>;
          case 'list': {
            const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>);
            return b.style === 'number' ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          case 'code':
            return (
              <div key={i} className={s.code}>
                <header>{b.language}</header>
                <pre>
                  <code>{b.code}</code>
                </pre>
              </div>
            );
          case 'callout':
            return (
              <aside key={i} className={`${s.callout} ${b.tone === 'tip' ? s.tip : b.tone === 'warning' ? s.warning : ''}`}>
                {b.title && <strong>{b.title}</strong>}
                {renderInline(b.text)}
              </aside>
            );
          case 'image':
            return safe(b.url) ? (
              <figure key={i} className={s.figure}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt={b.alt} loading="lazy" />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            ) : null;
          case 'resource':
            return safe(b.url) ? (
              <a key={i} href={b.url} className={s.resource} target="_blank" rel="noopener noreferrer nofollow">
                <ArrowUpRight size={18} aria-hidden />
                <strong>{b.title}</strong>
                {b.description && <span>{b.description}</span>}
              </a>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
}
