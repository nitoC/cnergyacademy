import { contourRing, seeded, smoothPath, type Pt } from '@/lib/geometry';

const ACCENTS: Record<string, { bg: string; ink: string; mark: string }> = {
  forest: { bg: '#15241b', ink: '#8dbf9d', mark: '#dfb46a' },
  amber: { bg: '#241d12', ink: '#dfb46a', mark: '#8dbf9d' },
  terracotta: { bg: '#25160f', ink: '#d9906d', mark: '#ecd09a' },
  slate: { bg: '#141d20', ink: '#93aeb8', mark: '#dfb46a' },
  clay: { bg: '#221a14', ink: '#c9a184', mark: '#8dbf9d' },
  moss: { bg: '#1a1e12', ink: '#a8b673', mark: '#dfb46a' },
};

/**
 * Generated course cover. Each course gets one of six terrain motifs drawn
 * in its subject's accent, so the catalogue reads as a single collection
 * rather than a pile of unrelated stock images.
 */
export function CourseCover({
  seed,
  pattern,
  accent,
  thumbnailUrl,
  label,
  className,
}: {
  seed: string;
  pattern?: string | null;
  accent?: string | null;
  thumbnailUrl?: string | null;
  label?: string;
  className?: string;
}) {
  if (thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumbnailUrl} alt="" className={className} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />;
  }
  const c = ACCENTS[accent ?? 'forest'] ?? ACCENTS.forest;
  const rand = seeded(seed);
  const W = 320;
  const H = 200;
  const lines: string[] = [];
  switch (pattern) {
    case 'switchback': {
      for (let k = 0; k < 3; k++) {
        const pts: Pt[] = [];
        for (let i = 0; i < 7; i++) pts.push([40 + (i % 2 ? 220 : 0) + rand() * 30 + k * 12, 20 + i * 28 + k * 4]);
        lines.push(smoothPath(pts, false, 0.35));
      }
      break;
    }
    case 'terrace': {
      for (let i = 0; i < 9; i++) {
        const pts: Pt[] = [];
        for (let x = 0; x <= W; x += 40) pts.push([x, 30 + i * 20 + Math.sin(x / 50 + i + rand()) * 7]);
        lines.push(smoothPath(pts));
      }
      break;
    }
    case 'delta': {
      const branch = (x: number, y: number, a: number, len: number, depth: number) => {
        if (depth === 0) return;
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        lines.push(smoothPath([[x, y], [(x + x2) / 2 + (rand() - 0.5) * 14, (y + y2) / 2], [x2, y2]]));
        branch(x2, y2, a - 0.45 - rand() * 0.2, len * 0.72, depth - 1);
        branch(x2, y2, a + 0.45 + rand() * 0.2, len * 0.72, depth - 1);
      };
      branch(20, H / 2, 0, 80, 5);
      break;
    }
    case 'ridge': {
      for (let i = 0; i < 6; i++) {
        const pts: Pt[] = [];
        for (let x = -20; x <= W + 20; x += 30) pts.push([x, 60 + i * 24 - Math.abs(Math.sin(x / 70 + i * 0.7)) * (40 - i * 4) + rand() * 6]);
        lines.push(smoothPath(pts, false, 0.3));
      }
      break;
    }
    case 'meander': {
      for (let k = 0; k < 4; k++) {
        const pts: Pt[] = [];
        for (let y = -10; y <= H + 10; y += 22) pts.push([W / 2 + Math.sin(y / 30 + k * 0.4) * (70 - k * 10) + k * 8, y]);
        lines.push(smoothPath(pts));
      }
      break;
    }
    default: {
      const cx = 80 + rand() * 160;
      const cy = 60 + rand() * 80;
      for (let i = 0; i < 9; i++) lines.push(contourRing(cx, cy, 18 + i * 22, 12 + i * 15, rand, 0.13));
    }
  }
  const mark: Pt = [60 + rand() * 200, 40 + rand() * 120];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: '100%', height: '100%', display: 'block', background: c.bg }}>
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={c.ink} strokeOpacity={0.55 - (i % 5) * 0.07} strokeWidth={i % 3 === 0 ? 1.3 : 0.8} />
      ))}
      <circle cx={mark[0]} cy={mark[1]} r="5" fill={c.mark} />
      <circle cx={mark[0]} cy={mark[1]} r="11" fill="none" stroke={c.mark} strokeOpacity="0.5" />
    </svg>
  );
}
