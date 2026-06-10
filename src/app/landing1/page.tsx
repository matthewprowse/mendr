'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  RevealQuote,
  ScrollAccordion,
  FaqList,
  ScrollDonut,
  FullWidthWordmark,
} from '@/components/landing/primitives';
import { useSmoothScroll } from '@/components/landing/use-smooth-scroll';

const STEPS = ['Step 1', 'Step 2', 'Step 3'];
// 5-card row: Step3 left-peek → Step1 → Step2 → Step3 → Step1 right-peek
const ROW = [2, 0, 1, 2, 0];

// Title/subtitle shown above the carousel — one per step.
const STEP_CONTENT = [
  {
    title: 'Header Name',
    subtitle:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
  },
  {
    title: 'Header Name',
    subtitle:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
  },
  {
    title: 'Header Name',
    subtitle:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
  },
];

// Testimonials revealed as you scroll through the social-proof section (pos 6–9).
const TESTIMONIALS = [
  {
    quote:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
    name: 'Matthew Prowse',
  },
  {
    quote:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
    name: 'Matthew Prowse',
  },
  {
    quote:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
    name: 'Matthew Prowse',
  },
  {
    quote:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.',
    name: 'Matthew Prowse',
  },
];

// FAQ placeholder entries — refine copy later.
const FAQ_Q = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?';
const FAQ_A =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.';
const FAQS = [
  { q: FAQ_Q, a: FAQ_A },
  { q: FAQ_Q, a: FAQ_A },
  { q: FAQ_Q, a: FAQ_A },
  { q: FAQ_Q, a: FAQ_A },
  { q: FAQ_Q, a: FAQ_A },
];

// "How we diagnose" accordion items — placeholder copy for now.
const DIAGNOSE_POINTS = [
  { title: 'Header Name', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
];

// "How we rank" donut segments — placeholder weights (sum to 100).
const RANK_SEGMENTS = [
  { title: 'Header Name', weight: 40, body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', weight: 30, body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', weight: 20, body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
  { title: 'Header Name', weight: 10, body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.' },
];

const PEEK = 32;
const GAP = 12;
const OFFSET = PEEK + GAP; // 44px — symmetric inset so active card is centred
const SIDE_SHRINK = 32; // peek cards are 32px shorter than the centred card
const TITLE_RISE = 12; // px the title dips/rises through during a step change

// Trade bubbles are placed at runtime (positions depend on the header's
// rendered size), 8 above the header and 8 below, never inside the keep-out
// box. Labels are placeholders for now; swap in real trades from SERVICE_LABELS.
// Each bubble wanders through its own X and Y waypoints on independent periods
// (so the 2-D path is irregular and barely repeats) within a per-cell envelope
// that keeps it from overlapping neighbours. Pills never rotate or scale —
// always horizontal; only their position moves.
type Bubble = {
  x: number; // home X — cell centre plus a static offset
  y: number; // home Y
  xs: number[]; // X waypoints in px (relative to home); pill wanders through these
  ys: number[]; // Y waypoints in px
  durX: number; // X period
  durY: number; // Y period (independent → the 2-D path barely repeats)
  delayX: number; // negative → starts mid-cycle, desynced
  delayY: number;
  easeX: string; // per-axis easing, picked from EASES
  easeY: string;
};

// Easing variants sprinkled across bubbles so even same-amplitude pills don't
// share a cadence. All are symmetric so the float eases at both extremes.
const EASES = [
  'ease-in-out',
  'cubic-bezier(0.45, 0, 0.55, 1)',
  'cubic-bezier(0.37, 0, 0.63, 1)',
];


export default function Landing1Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bubbleAreaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(0);
  const revealedRef = useRef(0);
  const countRef = useRef(4);
  const diagActiveRef = useRef(0);
  const rankActiveRef = useRef(0);
  const testiBodyRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const snapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [revealed, setRevealed] = useState(0); // testimonials revealed
  const [count, setCount] = useState(4); // reviews shown — 4 if they fit, else 3
  const [diagActive, setDiagActive] = useState(0); // active "how we diagnose" header
  const [rankActive, setRankActive] = useState(0); // active "how we rank" slice

  const { smoothScrollTo, goTo, scrollNext, scrollAnimRef } =
    useSmoothScroll(containerRef);

  // Place 8 trade bubbles in the strip above the header and 8 below — never
  // within PAD px of the header box, and never overlapping each other (the
  // spacing check includes the drift envelope so they don't graze mid-float).
  // Measured on the client because positions depend on rendered sizes; reruns
  // on resize.
  useEffect(() => {
    const area = bubbleAreaRef.current;
    const header = headerRef.current;
    const ruler = rulerRef.current;
    if (!area || !header || !ruler) return;

    const PAD = 16; // keep-out border around the header div
    const EDGE = 14; // margin from the section edges
    const GAP = 10; // min empty space between two pills
    const AMP = 10; // baseline drift the grid spacing is sized around
    const PER_STRIP = 8; // 8 pills above the header, 8 below

    const place = () => {
      const a = area.getBoundingClientRect();
      const h = header.getBoundingClientRect();
      // Measure the real pill (the ruler is a hidden Badge). Floor the values so
      // spacing can never collapse if measurement comes back small/zero (e.g.
      // before web fonts load), which is what lets pills overlap.
      const pw = Math.max(ruler.offsetWidth, 60);
      const ph = Math.max(ruler.offsetHeight, 20);
      // Centre-to-centre separation that keeps pills apart even when two of them
      // drift toward each other (2× the amplitude per axis).
      const needX = pw + GAP + AMP * 2;
      const needY = ph + GAP + AMP * 2;
      const koTop = h.top - a.top - PAD;
      const koBottom = h.bottom - a.top + PAD;

      // Jittered grid: PER_STRIP pills across as many columns as fit, then rows.
      // Each pill is then given a safe half-envelope R around its cell centre and
      // never leaves it (static offset + drift combined), so neighbours a full
      // cell apart can't overlap — and unlike random sampling it always lays down
      // the full count (degrading only if a strip is genuinely too small).
      const fill = (yMin: number, yMax: number, placed: Bubble[]) => {
        const W = a.width - EDGE * 2;
        const H = yMax - yMin;
        if (W <= 0 || H <= 0) return;
        const cols = Math.max(1, Math.min(PER_STRIP, Math.floor(W / needX)));
        const rows = Math.min(
          Math.ceil(PER_STRIP / cols),
          Math.max(1, Math.floor(H / needY))
        );
        const count = Math.min(PER_STRIP, cols * rows);
        const cellW = W / cols;
        const cellH = H / rows;
        // Safe half-envelope around each cell centre. A pill never leaves ±R of
        // its centre, so neighbours a full cell apart can't overlap. Because R is
        // always < cellH/2 − ph/2, every pill stays inside its strip too, so the
        // keep-out box and section edges are respected by construction. Roomier
        // cells hand out more travel — that's where the visible range comes from.
        const Rx = Math.max(0, (cellW - pw - GAP) / 2);
        const Ry = Math.max(0, (cellH - ph - GAP) / 2);
        // Five waypoints per axis: alternating sides with random magnitude → an
        // irregular wander rather than a tidy sine, so the path isn't easy to
        // anticipate. The wander never exceeds the amplitude it's given.
        const path = (amp: number) =>
          Array.from(
            { length: 5 },
            (_, j) => (j % 2 ? -1 : 1) * (0.5 + Math.random() * 0.5) * amp
          );
        for (let k = 0; k < count; k++) {
          const r = Math.floor(k / cols);
          const c = k % cols;
          const inRow = Math.min(cols, count - r * cols); // centre a partial last row
          const rowPad = ((cols - inRow) * cellW) / 2;
          // Spend most of the envelope on travel so pills cover a visible
          // distance; the leftover becomes a static offset that scatters their
          // resting points and breaks up the grid.
          const axAmp = Rx * (0.6 + Math.random() * 0.4);
          const ayAmp = Ry * (0.6 + Math.random() * 0.4);
          const offX = (Rx - axAmp) * (Math.random() * 2 - 1);
          const offY = (Ry - ayAmp) * (Math.random() * 2 - 1);
          const durX = 10 + Math.random() * 10; // 10–20s (~10% slower)
          const durY = 10 + Math.random() * 10;
          placed.push({
            x: EDGE + rowPad + cellW * (c + 0.5) + offX,
            y: yMin + cellH * (r + 0.5) + offY,
            xs: path(axAmp),
            ys: path(ayAmp),
            durX, durY,
            delayX: -Math.random() * durX, // negative → mid-cycle, desynced
            delayY: -Math.random() * durY,
            easeX: EASES[Math.floor(Math.random() * EASES.length)],
            easeY: EASES[Math.floor(Math.random() * EASES.length)],
          });
        }
      };

      const next: Bubble[] = [];
      fill(EDGE + ph / 2, koTop - ph / 2, next); // top strip
      fill(koBottom + ph / 2, a.height - EDGE - ph / 2, next); // bottom strip
      setBubbles(next);
    };

    place();
    // Web fonts change text width; re-measure once they're ready so spacing
    // isn't computed against the fallback font's narrower pills.
    document.fonts?.ready?.then(place);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const cardWidth = el.clientWidth - OFFSET * 2; // PEEK px on each side
    const stepWidth = cardWidth + GAP;

    // Row starts at card-index 1 (Step1). Progress 0→1→2 slides to Step2→Step3.
    // The centred card is full height; cards slide down to SIDE_SHRINK shorter
    // as they move to the peek positions.
    const applyTransform = (progress: number) => {
      const row = rowRef.current;
      if (!row) return;
      row.style.transform = `translateX(${OFFSET - (1 + progress) * stepWidth}px)`;
      const centerIdx = 1 + progress;
      for (let i = 0; i < row.children.length; i++) {
        const dist = Math.min(1, Math.abs(i - centerIdx));
        (row.children[i] as HTMLElement).style.height = `calc(100% - ${dist * SIDE_SHRINK}px)`;
      }

      // Title dips/fades on a vertical axis as the steps slide horizontally.
      // signed ∈ [-0.5, 0.5]: 0 = on a step, ±0.5 = halfway between two steps.
      const title = titleRef.current;
      if (title) {
        const signed = progress - Math.round(progress);
        title.style.opacity = `${1 - Math.min(1, Math.abs(signed) * 2)}`;
        title.style.transform = `translateY(${-signed * 2 * TITLE_RISE}px)`;
      }
    };

    applyTransform(0);

    const onScroll = () => {
      const { scrollTop, clientHeight } = el;
      // pos 0=hero, 1=step1, 2=step2, 3=step3, 4=next section
      const totalPos = scrollTop / clientHeight;
      const progress = Math.max(0, Math.min(2, totalPos - 1));

      applyTransform(progress);

      // round → text swaps at the .5 crossover, masked by opacity 0
      const next = Math.min(2, Math.round(progress));
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveIndex(next);
      }

      // Testimonials (pos 6–9): scrolling past a quote's step (~halfway) reveals
      // it, firing its staggered entrance. revealed changes ≤3×, not per frame.
      const tp = Math.max(0, Math.min(countRef.current, totalPos - 6));
      const revealedNow = Math.min(countRef.current, Math.floor(tp + 0.5));
      if (revealedNow !== revealedRef.current) {
        revealedRef.current = revealedNow;
        setRevealed(revealedNow);
      }

      // Diagnose accordion (pos 7+count .. 10+count): scroll advances the active
      // header one at a time before the next section.
      const diagBase = 7 + countRef.current;
      const diagIdx = Math.round(
        Math.max(0, Math.min(DIAGNOSE_POINTS.length - 1, totalPos - diagBase))
      );
      if (diagIdx !== diagActiveRef.current) {
        diagActiveRef.current = diagIdx;
        setDiagActive(diagIdx);
      }

      // Rank donut (pos 11+count .. 14+count): scroll advances the active slice.
      const rankBase = 11 + countRef.current;
      const rankIdx = Math.round(
        Math.max(0, Math.min(RANK_SEGMENTS.length - 1, totalPos - rankBase))
      );
      if (rankIdx !== rankActiveRef.current) {
        rankActiveRef.current = rankIdx;
        setRankActive(rankIdx);
      }

      if (snapRef.current) clearTimeout(snapRef.current);
      snapRef.current = setTimeout(() => {
        // Every section is a full screen that snaps. Tail after the testimonials:
        // how-we-rank, about, FAQ, contact, footer → last pos = 11 + count.
        const lastSnap = 18 + countRef.current;
        const nearest = Math.round(Math.min(lastSnap, Math.max(0, totalPos)));
        smoothScrollTo(nearest * clientHeight);
      }, 80);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (snapRef.current) clearTimeout(snapRef.current);
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, []);

  // Decide how many reviews fit: 4 if there's vertical room under the intro,
  // else 3. Measured on the client; reruns on resize.
  useEffect(() => {
    const body = testiBodyRef.current;
    const intro = introRef.current;
    if (!body || !intro) return;
    const ITEM = 132; // approx height of one revealed review (incl. its top gap)
    const measure = () => {
      const avail = body.clientHeight - 32; // minus the body's p-4
      const introH = intro.getBoundingClientRect().height;
      const c = avail - introH >= ITEM * 4 ? 4 : 3;
      if (c !== countRef.current) {
        countRef.current = c;
        setCount(c);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-10 bg-white h-[72px] flex items-center justify-between px-4">
        <span className="text-base font-medium">Mendr</span>
        <Avatar>
          <AvatarFallback />
        </Avatar>
      </header>

      <div
        ref={containerRef}
        className="fixed top-[72px] bottom-0 left-0 right-0 overflow-y-scroll"
      >

        {/* Hero — pos 0 */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-8 w-full">
              <div className="flex flex-col items-center gap-3">
                <h1 className="text-2xl font-semibold text-center">
                  Know What&apos;s Wrong Before Contacting Anyone
                </h1>
                <p className="text-sm text-muted-foreground text-center">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                  Curabitur cursus mi ligula, sed congue libero.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href="/start">Start Free Diagnosis</Link>
              </Button>
            </div>
          </div>
          <div className="p-4">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              onClick={() => goTo(1)}
            >
              Learn More
            </Button>
          </div>
        </section>

        {/* How It Works — scroll-jacked carousel, pos 1, 2, 3 */}
        <div className="relative h-[calc(300dvh-216px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">

            <div className="flex-1 flex flex-col p-4 gap-8 min-h-0">
              <div
                ref={titleRef}
                className="flex flex-col gap-2 shrink-0 will-change-transform"
              >
                <h2 className="text-2xl font-semibold text-center">
                  {STEP_CONTENT[activeIndex].title}
                </h2>
                <p className="text-sm text-muted-foreground text-center">
                  {STEP_CONTENT[activeIndex].subtitle}
                </p>
              </div>

              {/* 5-card row — overflows, clipped by this container */}
              <div className="flex-1 overflow-hidden -mx-4 min-h-0">
                <div
                  ref={rowRef}
                  className="flex h-full items-center"
                  style={{ width: 'calc(500vw - 392px)', willChange: 'transform' }}
                >
                  {ROW.map((stepIdx, i) => (
                    <div
                      key={i}
                      className="shrink-0 h-full bg-secondary rounded-lg flex items-center justify-center"
                      style={{
                        width: `calc(100vw - ${OFFSET * 2}px)`,
                        marginRight: i < ROW.length - 1 ? GAP : 0,
                      }}
                    >
                      <span className="text-5xl font-semibold text-foreground/10">
                        {STEPS[stepIdx]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 shrink-0">
              {activeIndex === 2 ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => goTo(activeIndex + 2)}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                  onClick={() => goTo(activeIndex + 2)}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Trust — pos 4 */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div
            ref={bubbleAreaRef}
            className="relative flex-1 flex items-center justify-center px-4 overflow-hidden"
          >
            {/* Hidden ruler — measured to size the no-overlap spacing */}
            <span
              ref={rulerRef}
              aria-hidden="true"
              className="absolute invisible left-0 top-0"
            >
              <Badge variant="secondary">Trade Name</Badge>
            </span>

            {/* Floating trade bubbles (placeholder labels) — positions measured
                client-side so they never enter the header's keep-out box */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {bubbles.map((b, i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${b.x}px`, top: `${b.y}px` }}
                >
                  {/* Independent X and Y waypoint timelines compose into a
                      wandering 2-D path. Each axis lives on its own layer so the
                      transforms don't clash; the Badge itself never transforms,
                      so the label stays horizontal at all times. */}
                  <span
                    className="lb-x inline-block"
                    style={{
                      animation: `lb-wx ${b.durX}s ${b.easeX} ${b.delayX}s infinite`,
                      willChange: 'transform',
                      '--x0': `${b.xs[0]}px`,
                      '--x1': `${b.xs[1]}px`,
                      '--x2': `${b.xs[2]}px`,
                      '--x3': `${b.xs[3]}px`,
                      '--x4': `${b.xs[4]}px`,
                    } as CSSProperties}
                  >
                    <span
                      className="lb-y inline-block"
                      style={{
                        animation: `lb-wy ${b.durY}s ${b.easeY} ${b.delayY}s infinite`,
                        willChange: 'transform',
                        '--y0': `${b.ys[0]}px`,
                        '--y1': `${b.ys[1]}px`,
                        '--y2': `${b.ys[2]}px`,
                        '--y3': `${b.ys[3]}px`,
                        '--y4': `${b.ys[4]}px`,
                      } as CSSProperties}
                    >
                      <Badge variant="secondary">Trade Name</Badge>
                    </span>
                  </span>
                </span>
              ))}
            </div>

            <div
              ref={headerRef}
              className="relative z-10 flex flex-col items-center gap-2"
            >
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero.
              </p>
            </div>

            <style>{`
              @keyframes lb-wx {
                0%   { transform: translateX(var(--x0)); }
                20%  { transform: translateX(var(--x1)); }
                40%  { transform: translateX(var(--x2)); }
                60%  { transform: translateX(var(--x3)); }
                80%  { transform: translateX(var(--x4)); }
                100% { transform: translateX(var(--x0)); }
              }
              @keyframes lb-wy {
                0%   { transform: translateY(var(--y0)); }
                20%  { transform: translateY(var(--y1)); }
                40%  { transform: translateY(var(--y2)); }
                60%  { transform: translateY(var(--y3)); }
                80%  { transform: translateY(var(--y4)); }
                100% { transform: translateY(var(--y0)); }
              }
              @media (prefers-reduced-motion: reduce) {
                .lb-x, .lb-y { animation: none !important; }
              }
            `}</style>
          </div>

          <div className="p-4 shrink-0">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => goTo(5)}
            >
              Continue
            </Button>
          </div>
        </section>

        {/* Statistics — pos 5 (placeholder; to be filled in later) */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col p-4 gap-8 min-h-0">
            <div className="flex flex-col gap-2 shrink-0">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero.
              </p>
            </div>

            <div className="flex flex-col gap-4 shrink-0">
              <div className="bg-secondary rounded-lg h-[104px]" />
              <div className="bg-secondary rounded-lg h-[104px]" />
            </div>

            <div className="flex-1 min-h-0 bg-secondary rounded-lg" />
          </div>

          <div className="p-4 shrink-0">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => goTo(6)}
            >
              Continue
            </Button>
          </div>
        </section>

        {/* Testimonials — pos 6 onward (one step per review, so 4 or 3 deep
            depending on screen height). Scroll-driven; Continue advances a step. */}
        <div
          className="relative"
          style={{
            height: `calc(${(count + 1) * 100}dvh - ${(count + 1) * 72}px)`,
          }}
        >
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div
              ref={testiBodyRef}
              className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden"
            >
              <div ref={introRef} className="flex flex-col items-center gap-8 w-full">
                <div className="flex flex-col items-center gap-2">
                  <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                  <p className="text-sm text-muted-foreground text-center">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                    cursus mi ligula, sed congue libero.
                  </p>
                </div>

                {/* Social-proof avatar cluster (placeholder circles) */}
                <div className="flex items-center justify-center gap-4">
                  <div className="flex">
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white" />
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white -ml-3" />
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white -ml-3" />
                  </div>
                  <div className="h-16 w-16 rounded-full bg-secondary" />
                  <div className="flex">
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white" />
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white -ml-3" />
                    <div className="h-12 w-12 rounded-full bg-secondary border-2 border-white -ml-3" />
                  </div>
                </div>
              </div>

              {/* Quotes reveal (active) when scroll reaches their step and play a
                  staggered entrance — quote, then avatar, then name. */}
              <div className="flex flex-col items-center w-full">
                {TESTIMONIALS.slice(0, count).map((t, i) => (
                  <RevealQuote
                    key={i}
                    quote={t.quote}
                    name={t.name}
                    active={i < revealed}
                  />
                ))}
              </div>
            </div>

            <div className="p-4 shrink-0">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  const el = containerRef.current;
                  if (!el) return;
                  const cur = Math.round(el.scrollTop / el.clientHeight);
                  goTo(Math.min(7 + count, cur + 1));
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* Tail (6–10): each a full screen, centred, with a Continue in the
            footer. Placeholder copy for now; refine later. */}

        {/* How we diagnose — sticky over 4 screens; scrolling advances the active
            accordion header one at a time before moving to the rank section. */}
        <div className="relative h-[calc(400dvh-288px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                <p className="text-sm text-muted-foreground text-center">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                  cursus mi ligula, sed congue libero.
                </p>
              </div>
              <ScrollAccordion
                items={DIAGNOSE_POINTS}
                active={diagActive}
                onSelect={(i) => goTo(7 + count + i)}
              />
            </div>
            <div className="p-4 shrink-0">
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* How we rank — sticky over 4 screens; scroll advances the active donut
            slice (foreground), the rest stay secondary, % + text update above. */}
        <div className="relative h-[calc(400dvh-288px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col p-4 gap-8 min-h-0">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                <p className="text-sm text-muted-foreground text-center">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                  cursus mi ligula, sed congue libero.
                </p>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0">
                <div className="flex flex-col items-center gap-2 max-w-md">
                  <h3 className="text-lg font-semibold text-center">
                    {RANK_SEGMENTS[rankActive].title}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {RANK_SEGMENTS[rankActive].body}
                  </p>
                </div>
                <div className="text-5xl font-semibold">
                  {RANK_SEGMENTS[rankActive].weight}%
                </div>
              </div>
            </div>

            {/* donut (shadcn chart): full-bleed, flush above the footer */}
            <ScrollDonut segments={RANK_SEGMENTS} active={rankActive} />

            <div className="p-4 shrink-0">
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* 7 · About me */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
            <div className="h-24 w-24 rounded-full bg-secondary" />
            <div className="flex flex-col items-center gap-2 max-w-md">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero. Praesent et diam eget libero
                egestas mattis sit amet vitae augue.
              </p>
            </div>
          </div>
          <div className="p-4 shrink-0">
            <Button variant="secondary" className="w-full" onClick={scrollNext}>
              Continue
            </Button>
          </div>
        </section>

        {/* 8 · FAQ — boxless accordion; tap a question to reveal its answer */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8 min-h-0">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero.
              </p>
            </div>
            <FaqList items={FAQS} />
          </div>
          <div className="p-4 shrink-0">
            <Button variant="secondary" className="w-full" onClick={scrollNext}>
              Continue
            </Button>
          </div>
        </section>

        {/* 9 · Contact — form + socials */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 min-h-0">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero.
              </p>
            </div>
            <form
              className="flex flex-col gap-3 w-full max-w-md"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input placeholder="First Name" aria-label="First Name" />
                </div>
                <div className="flex-1">
                  <Input placeholder="Surname" aria-label="Surname" />
                </div>
              </div>
              <Input type="email" placeholder="Email Address" aria-label="Email Address" />
              <Textarea placeholder="Message" aria-label="Message" rows={4} />
              <Button type="submit" variant="secondary" className="w-full">
                Send
              </Button>
            </form>
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="size-6 rounded-full bg-secondary" />
                <div className="size-6 rounded-full bg-secondary" />
                <div className="size-6 rounded-full bg-secondary" />
              </div>
              <a
                href="mailto:example@mendr.co.za"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                example@mendr.co.za
              </a>
            </div>
          </div>
          <div className="p-4 shrink-0">
            <Button variant="secondary" className="w-full" onClick={scrollNext}>
              Continue
            </Button>
          </div>
        </section>

        {/* 10 · Footer — final CTA + links, then the big wordmark */}
        <footer className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <Link
                href="/start"
                className="text-2xl font-semibold text-center hover:underline"
              >
                Start Diagnosis
              </Link>
              <p className="text-sm text-muted-foreground text-center">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
                cursus mi ligula, sed congue libero.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-4 px-4 pb-4 overflow-hidden">
            <a href="#" className="text-lg font-semibold">
              For Specialists
            </a>
            <FullWidthWordmark
              text="Mendr"
              className="w-full fill-foreground opacity-25"
            />
            {/* Terms / Privacy below the wordmark, pushed to the page edges. */}
            <nav className="flex w-full items-center justify-between">
              <a href="#" className="text-sm font-medium">
                Terms
              </a>
              <a href="#" className="text-sm font-medium">
                Privacy
              </a>
            </nav>
          </div>
        </footer>

      </div>
    </>
  );
}
