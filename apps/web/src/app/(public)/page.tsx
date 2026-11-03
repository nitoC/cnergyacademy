import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { HeroJourney } from '@/components/illustrations/HeroJourney';
import { CourseCover } from '@/components/illustrations/CourseCover';
import { serverGet } from '@/lib/server-api';
import { duration, money } from '@/lib/format';
import type { CourseCard, Paginated, Subject } from '@/types/api';
import s from './public.module.scss';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const [subjects, courses] = await Promise.all([
    serverGet<Subject[]>('/subjects'),
    serverGet<Paginated<CourseCard>>('/courses?sort=popular&pageSize=3'),
  ]);
  const featured = courses.ok ? courses.data.items : [];

  return (
    <div className={s.container}>
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <h1 className={s.heroTitle}>
            Every expert took the <em>long way</em> round.
          </h1>
          <p className={s.heroLead}>Structured courses, honest checkpoints and mentors who answer — so the long way is also the sure one.</p>
          <div className={s.heroActions}>
            <ButtonLink href="/courses" variant="primary" size="lg">
              Browse courses
            </ButtonLink>
            <ButtonLink href="/roadmaps" variant="secondary" size="lg">
              Follow a roadmap
            </ButtonLink>
          </div>
        </div>
        <div className={s.heroArt}>
          <HeroJourney />
          <span className={s.legend}>Sheet 01 · the shape of a course</span>
        </div>
      </section>

      {subjects.ok && subjects.data.length > 0 && (
        <section className={s.section} aria-labelledby="subjects">
          <div className={s.sectionHead}>
            <h2 id="subjects">Five fields, one method</h2>
            <Link href="/courses" className={s.indexCount}>
              All courses →
            </Link>
          </div>
          <ol className={s.index}>
            {subjects.data.map((subj, i) => (
              <li key={subj.id}>
                <Link href={`/courses?subject=${subj.slug}`}>
                  <span className={s.indexNo}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={s.indexName}>
                    {subj.name}
                    <span className={s.indexDesc}>{subj.description}</span>
                  </span>
                  <span className={s.indexCount}>
                    {subj.publishedCourses} {subj.publishedCourses === 1 ? 'course' : 'courses'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={s.section} aria-labelledby="method">
        <div className={s.sectionHead}>
          <h2 id="method">How a course works</h2>
        </div>
        <div className={s.method}>
          <div className={s.methodStep}>
            <span className={s.methodNo}>01 — READ</span>
            <h3>Written to be studied</h3>
            <p>Lessons are prose, code and worked examples, set for reading rather than skimming.</p>
          </div>
          <div className={s.methodStep}>
            <span className={s.methodNo}>02 — CHECK</span>
            <h3>Checkpoints that mean it</h3>
            <p>Short quizzes close each module. Some open the next one only when you pass.</p>
          </div>
          <div className={s.methodStep}>
            <span className={s.methodNo}>03 — CERTIFY</span>
            <h3>Proof anyone can check</h3>
            <p>Finish every requirement and receive a certificate with a public verification code.</p>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className={s.section} aria-labelledby="featured">
          <div className={s.sectionHead}>
            <h2 id="featured">Where learners are now</h2>
          </div>
          <div className={s.featured}>
            {featured.slice(0, 1).map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className={`${s.feature} ${s.featureLarge}`}>
                <div className={s.featureCover}>
                  <CourseCover seed={c.slug} pattern={c.coverPattern} accent={c.subject.accentColor} thumbnailUrl={c.thumbnailUrl} />
                </div>
                <div className={s.featureBody}>
                  <span className="visually-hidden">Featured course</span>
                  <small style={{ color: 'var(--ink-3)' }}>
                    {c.subject.name} · {duration(c.estimatedMinutes)} · {money(c.price, c.currency)}
                  </small>
                  <h3>{c.title}</h3>
                  <p>{c.shortDescription}</p>
                </div>
              </Link>
            ))}
            <div className={s.featureStack}>
              {featured.slice(1).map((c) => (
                <Link key={c.id} href={`/courses/${c.slug}`} className={s.feature}>
                  <div className={s.featureCover}>
                    <CourseCover seed={c.slug} pattern={c.coverPattern} accent={c.subject.accentColor} thumbnailUrl={c.thumbnailUrl} />
                  </div>
                  <div className={s.featureBody}>
                    <small style={{ color: 'var(--ink-3)' }}>
                      {c.subject.name} · {money(c.price, c.currency)}
                    </small>
                    <h3>{c.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={s.closing}>
        <h2>Start with the first lesson. It&apos;s free.</h2>
        <ButtonLink href="/register" variant="primary" size="lg">
          Create an account
        </ButtonLink>
      </section>
    </div>
  );
}
