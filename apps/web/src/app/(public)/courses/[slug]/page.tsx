import Link from 'next/link';
import { Check, Clock, Gauge, KeyRound, Layers, Lock, ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { Pill } from '@/components/ui/Feedback';
import { serverGet } from '@/lib/server-api';
import { ACCESS_LABEL, DIFFICULTY_LABEL, duration, money } from '@/lib/format';
import type { CourseDetail } from '@/types/api';
import { CourseCta } from './CourseCta';
import { CourseMap } from './CourseMap';
import s from '../../public.module.scss';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const res = await serverGet<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  return res.ok ? { title: res.data.title, description: res.data.shortDescription } : { title: 'Course' };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await serverGet<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    throw new Error('Course could not be loaded');
  }
  const c = res.data;

  return (
    <div className={s.container}>
      <section className={s.detailHero}>
        <div>
          <small style={{ color: 'var(--ink-3)' }}>
            {c.subject.name}
            {c.category ? ` · ${c.category.name}` : ''}
          </small>
          <h1 className={s.detailTitle}>{c.title}</h1>
          <p className={s.detailLead}>{c.shortDescription}</p>
          <p style={{ marginTop: 18, color: 'var(--ink-2)', fontSize: '0.9rem' }}>
            By <strong style={{ color: 'var(--ink-0)' }}>{c.creator.displayName ?? c.creator.fullName}</strong>
            {c.status !== 'PUBLISHED' && (
              <span style={{ marginLeft: 10 }}>
                <Pill tone="amber">Preview · {c.status.toLowerCase()}</Pill>
              </span>
            )}
          </p>
        </div>
        <aside className={s.buyBox} aria-label="Enrolment">
          <div className={s.buyCover}>
            <CourseCover seed={c.slug} pattern={c.coverPattern} accent={c.subject.accentColor} thumbnailUrl={c.thumbnailUrl} />
          </div>
          <div className={s.buyBody}>
            <div className={s.price}>{money(c.price, c.currency)}</div>
            <CourseCta course={c} />
            <ul className={s.facts}>
              <li><Gauge size={15} /> {DIFFICULTY_LABEL[c.difficulty]}</li>
              <li><Clock size={15} /> {duration(c.estimatedMinutes)}</li>
              <li><Layers size={15} /> {c.modules.length} modules · {c.lessonCount} lessons</li>
              {c.certificateEnabled && <li><ScrollText size={15} /> Certificate on completion</li>}
            </ul>
          </div>
        </aside>
      </section>

      <div className={s.detailGrid}>
        <div>
          {c.learningOutcomes.length > 0 && (
            <>
              <h2 className={s.h2}>What you will be able to do</h2>
              <ul className={s.outcomes}>
                {c.learningOutcomes.map((o) => (
                  <li key={o}>
                    <Check size={16} aria-hidden /> {o}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 className={s.h2}>About this course</h2>
          <p className={s.prose}>{c.description}</p>

          <CourseMap
            courseId={c.id}
            slug={c.slug}
            authenticated={c.viewer.authenticated}
            list={
          <div className={s.curriculum}>
            {c.modules.map((m) => (
              <details key={m.id} className={s.moduleRow} open={m.position === 1}>
                <summary>
                  <span className={s.moduleNo}>{String(m.position).padStart(2, '0')}</span>
                  <span>
                    <span className={s.moduleTitle}>{m.title}</span>
                    {m.summary && <span style={{ display: 'block', fontSize: '0.86rem', color: 'var(--ink-3)' }}>{m.summary}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {m.decision.granted ? (
                      <Pill tone={m.access === 'FREE' ? 'forest' : 'slate'}>{m.access === 'FREE' ? 'Free' : 'Unlocked'}</Pill>
                    ) : m.decision.requiresPurchase ? (
                      <Pill tone="terracotta"><Lock size={11} /> {ACCESS_LABEL[m.access]}</Pill>
                    ) : m.decision.requiresPrerequisite ? (
                      <Pill tone="amber"><KeyRound size={11} /> Needs quiz</Pill>
                    ) : (
                      <Pill>{ACCESS_LABEL[m.access]}</Pill>
                    )}
                  </span>
                </summary>
                <ol>
                  {m.lessons.map((l) => (
                    <li key={l.id}>
                      <span>{l.title}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{l.estimatedMinutes} min</span>
                    </li>
                  ))}
                  {m.quizCount > 0 && <li><span style={{ color: 'var(--amber-300)' }}>Checkpoint quiz</span></li>}
                  {m.prerequisiteQuiz && <li><span>Unlocks after passing “{m.prerequisiteQuiz.title}”</span></li>}
                </ol>
              </details>
            ))}
          </div>
            }
          />
        </div>
        <aside>
          {c.roadmaps.length > 0 && (
            <div className={s.creatorCard}>
              <span className={s.filterTitle}>On these roadmaps</span>
              {c.roadmaps.map((r) => (
                <Link key={r.slug} href={`/roadmaps/${r.slug}`} style={{ color: 'var(--amber-300)', fontWeight: 600 }}>
                  {r.title} →
                </Link>
              ))}
            </div>
          )}
          <div className={s.creatorCard}>
            <span className={s.filterTitle}>Your instructor</span>
            <strong style={{ color: 'var(--ink-0)', fontSize: '1.05rem' }}>{c.creator.displayName ?? c.creator.fullName}</strong>
            {c.creator.bio && <p>{c.creator.bio}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
