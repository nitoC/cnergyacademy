import { contourRing, seeded, smoothPath, type Pt } from '@/lib/geometry';

/**
 * Landing illustration: a contour map with a winding trail climbing from a
 * trailhead to a summit, marked with the four stages of every course.
 * Pure SVG, generated deterministically so server and client agree.
 */
const TRAIL: Pt[] = [
  [70, 520], [150, 470], [250, 486], [330, 430], [270, 360], [180, 320], [230, 250], [360, 236], [450, 280], [520, 220], [470, 150], [400, 112], [480, 70], [560, 60],
];
const STOPS = [
  { at: 2, label: '01  Read', sub: 'Written lessons' },
  { at: 5, label: '02  Check', sub: 'Quizzes that gate the next climb' },
  { at: 8, label: '03  Ask', sub: 'Mentors on the trail' },
  { at: 13, label: '04  Certify', sub: 'Verifiable on completion' },
];

export function HeroJourney() {
  const rand = seeded('genuslab-hero');
  const rings: { d: string; o: number }[] = [];
  // Two hills of nested contours.
  for (let i = 0; i < 9; i++) rings.push({ d: contourRing(420, 170, 70 + i * 34, 52 + i * 26, rand, 0.1), o: 0.5 - i * 0.04 });
  for (let i = 0; i < 6; i++) rings.push({ d: contourRing(170, 420, 50 + i * 30, 36 + i * 22, rand, 0.12), o: 0.38 - i * 0.05 });
  const trail = smoothPath(TRAIL);

  return (
    <svg viewBox="0 0 640 580" role="img" aria-labelledby="hero-title hero-desc" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <title id="hero-title">A winding learning trail across a contour map</title>
      <desc id="hero-desc">The trail passes four markers: read, check, ask and certify, ending at a summit flag.</desc>
      <defs>
        <radialGradient id="hj-glow" cx="66%" cy="28%" r="70%">
          <stop offset="0" stopColor="#1f3326" />
          <stop offset="1" stopColor="#0c100e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hj-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5f9d74" />
          <stop offset="0.65" stopColor="#dfb46a" />
          <stop offset="1" stopColor="#ecd09a" />
        </linearGradient>
        <filter id="hj-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="0" y="0" width="640" height="580" fill="url(#hj-glow)" />
      {/* map grid */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={i * 80} y1="0" x2={i * 80} y2="580" stroke="#eee8dc" strokeOpacity="0.035" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 80} x2="640" y2={i * 80} stroke="#eee8dc" strokeOpacity="0.035" />
      ))}
      {rings.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke="#8dbf9d" strokeOpacity={Math.max(0.08, r.o)} strokeWidth={i % 3 === 0 ? 1.2 : 0.7} />
      ))}

      {/* trail: soft shadow, worn bed, dashed footpath */}
      <path d={trail} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="14" strokeLinecap="round" filter="url(#hj-soft)" transform="translate(0 6)" />
      <path d={trail} fill="none" stroke="#1e2920" strokeWidth="10" strokeLinecap="round" />
      <path d={trail} fill="none" stroke="url(#hj-trail)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1 7" />

      {/* trailhead */}
      <g transform={`translate(${TRAIL[0][0]} ${TRAIL[0][1]})`}>
        <circle r="16" fill="#3f7d57" fillOpacity="0.18">
          <animate attributeName="r" values="10;20;10" dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.3;0;0.3" dur="3.2s" repeatCount="indefinite" />
        </circle>
        <circle r="7" fill="#3f7d57" stroke="#eee8dc" strokeWidth="1.5" />
        <text x="14" y="22" fill="#a39c8d" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.5">YOU START HERE</text>
      </g>

      {STOPS.map((s, i) => {
        const [x, y] = TRAIL[s.at];
        const last = i === STOPS.length - 1;
        const left = x > 400;
        return (
          <g key={s.label} transform={`translate(${x} ${y})`}>
            {last ? (
              <g>
                <line x1="0" y1="0" x2="0" y2="-34" stroke="#eee8dc" strokeWidth="1.6" />
                <path d="M0,-34 L22,-27 L0,-20 Z" fill="#dfb46a" />
                <circle r="6" fill="#c48f3a" stroke="#ecd09a" strokeWidth="1.5" />
              </g>
            ) : (
              <g>
                <ellipse cx="0" cy="6" rx="12" ry="4" fill="#000" fillOpacity="0.5" />
                <circle r="10" fill="#172019" stroke="#dfb46a" strokeWidth="1.4" />
                <circle r="4" fill="#dfb46a" />
              </g>
            )}
            <g transform={`translate(${left ? -18 : 18} ${last ? -6 : 4})`} textAnchor={left ? 'end' : 'start'}>
              <text fill="#eee8dc" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="1.2">{s.label}</text>
              <text y="16" fill="#777164" fontFamily="var(--font-sans)" fontSize="11">{s.sub}</text>
            </g>
          </g>
        );
      })}

      {/* compass */}
      <g transform="translate(588 520)" opacity="0.7">
        <circle r="20" fill="none" stroke="#eee8dc" strokeOpacity="0.25" />
        <path d="M0,-15 L4,0 L0,15 L-4,0 Z" fill="#b8613d" />
        <text y="-24" textAnchor="middle" fill="#a39c8d" fontFamily="var(--font-mono)" fontSize="9">N</text>
      </g>
    </svg>
  );
}
