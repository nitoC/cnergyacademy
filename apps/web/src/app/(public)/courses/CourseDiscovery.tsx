'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { DIFFICULTY_LABEL, duration, money } from '@/lib/format';
import type { CourseCard, Paginated, Subject } from '@/types/api';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback';
import { Segmented, Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import s from '../public.module.scss';

export function CourseDiscovery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = {
    search: params.get('search') ?? '',
    subject: params.get('subject') ?? '',
    difficulty: params.get('difficulty') ?? '',
    price: params.get('price') ?? '',
    sort: params.get('sort') ?? 'newest',
    page: Number(params.get('page') ?? 1),
  };
  const [text, setText] = useState(q.search);

  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // Debounced search-as-you-type
  useEffect(() => {
    if (text === q.search) return;
    const t = setTimeout(() => update({ search: text }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const courses = useQuery({
    queryKey: ['catalog', q],
    queryFn: () => get<Paginated<CourseCard>>('/courses', { ...q, pageSize: 12, search: q.search || undefined, subject: q.subject || undefined, difficulty: q.difficulty || undefined, price: q.price || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className={s.container}>
      <header className={s.discoverHead}>
        <h1 className={s.pageTitle}>Find your next course</h1>
        <label className={s.searchBar}>
          <Search size={20} aria-hidden />
          <span className="visually-hidden">Search courses</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by topic, skill or instructor"
            autoFocus
          />
        </label>
      </header>

      <div className={s.discover}>
        <aside className={s.filters} aria-label="Filters">
          <div className={s.filterGroup}>
            <span className={s.filterTitle}>Subject</span>
            <div className={s.subjectList}>
              <button type="button" aria-pressed={!q.subject} onClick={() => update({ subject: '' })}>
                <span>All subjects</span>
              </button>
              {subjects.data?.map((sub) => (
                <button key={sub.id} type="button" aria-pressed={q.subject === sub.slug} onClick={() => update({ subject: sub.slug })}>
                  <span>{sub.name}</span>
                  <span>{sub.publishedCourses}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={s.filterGroup}>
            <span className={s.filterTitle}>Level</span>
            <Segmented
              label="Level"
              value={q.difficulty}
              onChange={(v) => update({ difficulty: v })}
              options={[{ value: '', label: 'Any' }, { value: 'BEGINNER', label: 'Beginner' }, { value: 'INTERMEDIATE', label: 'Mid' }, { value: 'ADVANCED', label: 'Adv.' }]}
            />
          </div>
          <div className={s.filterGroup}>
            <span className={s.filterTitle}>Price</span>
            <Segmented label="Price" value={q.price} onChange={(v) => update({ price: v })} options={[{ value: '', label: 'Any' }, { value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }]} />
          </div>
        </aside>

        <section aria-live="polite">
          <div className={s.resultsHead}>
            <span>{courses.data ? `${courses.data.total} ${courses.data.total === 1 ? 'course' : 'courses'}` : ' '}</span>
            <div style={{ width: 200 }}>
              <Select
                label="Sort by"
                hideLabel
                value={q.sort}
                onChange={(v) => update({ sort: v })}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'popular', label: 'Most enrolled' },
                  { value: 'shortest', label: 'Shortest first' },
                  { value: 'title', label: 'Title A–Z' },
                ]}
              />
            </div>
          </div>
          {courses.error ? (
            <ErrorState error={courses.error} retry={() => courses.refetch()} />
          ) : !courses.data ? (
            <LoadingBlock rows={6} />
          ) : courses.data.items.length === 0 ? (
            <EmptyState
              title="No courses match"
              action={
                <Button size="sm" onClick={() => router.replace(pathname)}>
                  Clear filters
                </Button>
              }
            >
              Try a broader search or another subject.
            </EmptyState>
          ) : (
            <>
              <ul className={s.results}>
                {courses.data.items.map((c) => (
                  <li key={c.id} className={s.result}>
                    <Link href={`/courses/${c.slug}`}>
                      <div className={s.resultCover}>
                        <CourseCover seed={c.slug} pattern={c.coverPattern} accent={c.subject.accentColor} thumbnailUrl={c.thumbnailUrl} />
                      </div>
                      <div className={s.resultBody}>
                        <small style={{ color: 'var(--ink-3)', fontSize: '0.78rem' }}>
                          {c.subject.name}
                          {c.category ? ` · ${c.category.name}` : ''}
                        </small>
                        <h3>{c.title}</h3>
                        <p>{c.shortDescription}</p>
                        <small style={{ color: 'var(--ink-3)', fontSize: '0.78rem' }}>
                          {c.creator.displayName ?? c.creator.fullName} · {DIFFICULTY_LABEL[c.difficulty]} · {duration(c.estimatedMinutes)} · {c.moduleCount} {c.moduleCount === 1 ? 'module' : 'modules'}
                        </small>
                      </div>
                      <span className={`${s.resultPrice} ${c.isFree ? s.free : ''}`}>{money(c.price, c.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {courses.data.totalPages > 1 && <Pagination page={courses.data.page} totalPages={courses.data.totalPages} total={courses.data.total} onPage={(p) => update({ page: p })} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
