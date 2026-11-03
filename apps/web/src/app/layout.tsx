import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import '@/styles/globals.scss';
import { Providers } from './providers';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz', 'SOFT'], display: 'swap' });
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
const reading = Source_Serif_4({ subsets: ['latin'], variable: '--font-reading', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Genuslab Academy', template: '%s · Genuslab Academy' },
  description: 'Structured courses, honest checkpoints and mentors who answer — across engineering, cloud, security, AI and business.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${reading.variable}`}>
      <body>
        <a href="#main" className="visually-hidden">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
