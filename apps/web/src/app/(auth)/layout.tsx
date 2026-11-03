import { HeroJourney } from '@/components/illustrations/HeroJourney';
import { Wordmark } from '@/components/navigation/Wordmark';
import { ThemeToggle } from '@/features/theme/ThemeToggle';
import s from './auth.module.scss';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.split}>
      <main id="main" className={s.formSide}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <ThemeToggle />
        </div>
        <div className={s.formWrap}>{children}</div>
      </main>
      <aside className={s.artSide} aria-hidden>
        <HeroJourney />
        <p className={s.quote}>“The trail is long so the summit can be honest.”</p>
      </aside>
    </div>
  );
}
