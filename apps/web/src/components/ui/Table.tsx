'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState, ErrorState, LoadingBlock } from './Feedback';
import s from './ui.module.scss';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  retry,
  empty = 'Nothing here yet',
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
  empty?: string;
  caption?: string;
}) {
  if (error) return <ErrorState error={error} retry={retry} />;
  if (loading && !rows) return <LoadingBlock rows={6} />;
  if (!rows?.length) return <EmptyState title={empty} />;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? s.num : undefined} style={{ width: c.width }} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? s.num : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Cell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <>
      <span className={s.primaryCell}>{primary}</span>
      {secondary && <span className={s.subCell}>{secondary}</span>}
    </>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <span>
        {total} {total === 1 ? 'result' : 'results'} · page {page} of {totalPages}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} icon={<ChevronLeft size={14} />}>
          Previous
        </Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next <ChevronRight size={14} />
        </Button>
      </span>
    </nav>
  );
}
