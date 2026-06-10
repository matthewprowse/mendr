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

// ---------------------------------------------------------------------------
// /landing2 — specialist ("Pro") marketing page. Shares the visual grammar of
// /landing1 (snap sections, scroll-driven reveals, the same primitives) but is
// a new composition. All prose is placeholder (Header Name + lorem) for now.
//
// Position map (one screen = 100dvh - 72px):
//   0        Hero
//   1–3      How It Works (sticky carousel)
//   4–7      Your Toolkit (sticky, scroll-stepped accordion)
//   8        Built for Every Trade (drifting badges)
//   9        Stats
//   10–13    Testimonials (sticky, scroll-driven reveal)
//   14–17    How You Rank (sticky donut)
//   18–21    Plans (sticky, scroll-stepped cards)
//   22       FAQ
//   23       Contact
//   24       Footer
// ---------------------------------------------------------------------------

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur cursus mi ligula, sed congue libero.';

// Where the "Join Mendr Pro" CTA sends specialists — the full onboarding /
// application wizard.
const JOIN_HREF = '/pro/network';

const STEPS = ['Step 1', 'Step 2', 'Step 3'];
// 5-card row: Step3 left-peek → Step1 → Step2 → Step3 → Step1 right-peek
const ROW = [2, 0, 1, 2, 0];

// Title/subtitle shown above the carousel — one per step.
const STEP_CONTENT = [
  { title: 'Header Name', subtitle: LOREM },
  { title: 'Header Name', subtitle: LOREM },
  { title: 'Header Name', subtitle: LOREM },
];

// "Your Toolkit" accordion — scroll steps through each, one highlighted at a
// time. Placeholder copy.
const TOOLKIT = [
  { title: 'Header Name', body: LOREM },
  { title: 'Header Name', body: LOREM },
  { title: 'Header Name', body: LOREM },
  { title: 'Header Name', body: LOREM },
];

// Four stat cards (2×2 grid) + a big block below — placeholder.
const STATS = [
  { value: '000', label: 'Header Name' },
  { value: '000', label: 'Header Name' },
  { value: '000', label: 'Header Name' },
  { value: '000', label: 'Header Name' },
];

// Pro testimonials — placeholder copy.
const TESTIMONIALS = [
  { quote: LOREM, name: 'Header Name' },
  { quote: LOREM, name: 'Header Name' },
  { quote: LOREM, name: 'Header Name' },
];
const TESTI_COUNT = TESTIMONIALS.length;

// "How you rank" donut segments — placeholder weights (sum to 100).
const RANK_SEGMENTS = [
  { title: 'Header Name', weight: 40, body: LOREM },
  { title: 'Header Name', weight: 30, body: LOREM },
  { title: 'Header Name', weight: 20, body: LOREM },
  { title: 'Header Name', weight: 10, body: LOREM },
];

// Plans ladder — four placeholder tiers, monthly + annual prices.
const PLANS = [
  {
    name: 'Header Name',
    priceMonthly: 'R000',
    priceAnnual: 'R000',
    features: ['Lorem ipsum dolor', 'Consectetur adipiscing', 'Curabitur cursus'],
  },
  {
    name: 'Header Name',
    priceMonthly: 'R000',
    priceAnnual: 'R000',
    features: ['Lorem ipsum dolor', 'Consectetur adipiscing', 'Curabitur cursus'],
  },
  {
    name: 'Header Name',
    priceMonthly: 'R000',
    priceAnnual: 'R000',
    features: ['Lorem ipsum dolor', 'Consectetur adipiscing', 'Curabitur cursus'],
  },
  {
    name: 'Header Name',
    priceMonthly: 'R000',
    priceAnnual: 'R000',
    features: ['Lorem ipsum dolor', 'Consectetur adipiscing', 'Curabitur cursus'],
  },
];

// FAQ placeholder entries.
const FAQ_Q = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?';
const FAQS = [
  { q: FAQ_Q, a: LOREM },
  { q: FAQ_Q, a: LOREM },
  { q: FAQ_Q, a: LOREM },
  { q: FAQ_Q, a: LOREM },
  { q: FAQ_Q, a: LOREM },
];

const PEEK = 32;
const GAP = 12;
const OFFSET = PEEK + GAP; // 44px — symmetric inset so active card is centred
const SIDE_SHRINK = 32; // peek cards are 32px shorter than the centred card
const TITLE_RISE = 12; // px the title dips/rises through during a step change

// Each bubble wanders through its own X and Y waypoints on independent periods
// within a per-cell envelope that keeps it from overlapping neighbours.
type Bubble = {
  x: number;
  y: number;
  xs: number[];
  ys: number[];
  durX: number;
  durY: number;
  delayX: number;
  delayY: number;
  easeX: string;
  easeY: string;
};

const EASES = [
  'ease-in-out',
  'cubic-bezier(0.45, 0, 0.55, 1)',
  'cubic-bezier(0.37, 0, 0.63, 1)',
];

export default function Landing2Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bubbleAreaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLSpanElement>(null);
  const snapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(0);
  const toolkitActiveRef = useRef(0);
  const revealedRef = useRef(0);
  const rankActiveRef = useRef(0);
  const planActiveRef = useRef(0);

  const [activeIndex, setActiveIndex] = useState(0); // carousel step
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [toolkitActive, setToolkitActive] = useState(0); // scroll-stepped
  const [revealed, setRevealed] = useState(0); // testimonials revealed
  const [rankActive, setRankActive] = useState(0); // donut slice
  const [planActive, setPlanActive] = useState(0); // highlighted plan
  const [annual, setAnnual] = useState(false); // pricing toggle

  const { smoothScrollTo, goTo, scrollNext, scrollAnimRef } =
    useSmoothScroll(containerRef);

  // Place 8 trade bubbles above the header and 8 below — never inside the
  // header's keep-out box and never overlapping. Measured on the client.
  useEffect(() => {
    const area = bubbleAreaRef.current;
    const header = headerRef.current;
    const ruler = rulerRef.current;
    if (!area || !header || !ruler) return;

    const PAD = 16;
    const EDGE = 14;
    const GAP = 10;
    const AMP = 10;
    const PER_STRIP = 8;

    const place = () => {
      const a = area.getBoundingClientRect();
      const h = header.getBoundingClientRect();
      const pw = Math.max(ruler.offsetWidth, 60);
      const ph = Math.max(ruler.offsetHeight, 20);
      const needX = pw + GAP + AMP * 2;
      const needY = ph + GAP + AMP * 2;
      const koTop = h.top - a.top - PAD;
      const koBottom = h.bottom - a.top + PAD;

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
        const Rx = Math.max(0, (cellW - pw - GAP) / 2);
        const Ry = Math.max(0, (cellH - ph - GAP) / 2);
        const path = (amp: number) =>
          Array.from(
            { length: 5 },
            (_, j) => (j % 2 ? -1 : 1) * (0.5 + Math.random() * 0.5) * amp
          );
        for (let k = 0; k < count; k++) {
          const r = Math.floor(k / cols);
          const c = k % cols;
          const inRow = Math.min(cols, count - r * cols);
          const rowPad = ((cols - inRow) * cellW) / 2;
          const axAmp = Rx * (0.6 + Math.random() * 0.4);
          const ayAmp = Ry * (0.6 + Math.random() * 0.4);
          const offX = (Rx - axAmp) * (Math.random() * 2 - 1);
          const offY = (Ry - ayAmp) * (Math.random() * 2 - 1);
          const durX = 10 + Math.random() * 10;
          const durY = 10 + Math.random() * 10;
          placed.push({
            x: EDGE + rowPad + cellW * (c + 0.5) + offX,
            y: yMin + cellH * (r + 0.5) + offY,
            xs: path(axAmp),
            ys: path(ayAmp),
            durX,
            durY,
            delayX: -Math.random() * durX,
            delayY: -Math.random() * durY,
            easeX: EASES[Math.floor(Math.random() * EASES.length)],
            easeY: EASES[Math.floor(Math.random() * EASES.length)],
          });
        }
      };

      const next: Bubble[] = [];
      fill(EDGE + ph / 2, koTop - ph / 2, next);
      fill(koBottom + ph / 2, a.height - EDGE - ph / 2, next);
      setBubbles(next);
    };

    place();
    document.fonts?.ready?.then(place);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  // Scroll orchestration: carousel transform, toolkit step, testimonial reveal,
  // donut slice, plan highlight, and the debounced snap.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const cardWidth = el.clientWidth - OFFSET * 2;
    const stepWidth = cardWidth + GAP;

    const applyTransform = (progress: number) => {
      const row = rowRef.current;
      if (!row) return;
      row.style.transform = `translateX(${OFFSET - (1 + progress) * stepWidth}px)`;
      const centerIdx = 1 + progress;
      for (let i = 0; i < row.children.length; i++) {
        const dist = Math.min(1, Math.abs(i - centerIdx));
        (row.children[i] as HTMLElement).style.height = `calc(100% - ${dist * SIDE_SHRINK}px)`;
      }
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
      const totalPos = scrollTop / clientHeight;

      // Carousel (pos 1–3)
      const progress = Math.max(0, Math.min(2, totalPos - 1));
      applyTransform(progress);
      const next = Math.min(2, Math.round(progress));
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveIndex(next);
      }

      // Toolkit (pos 4–7): scroll advances the active item one at a time.
      const toolkitIdx = Math.round(
        Math.max(0, Math.min(TOOLKIT.length - 1, totalPos - 4))
      );
      if (toolkitIdx !== toolkitActiveRef.current) {
        toolkitActiveRef.current = toolkitIdx;
        setToolkitActive(toolkitIdx);
      }

      // Testimonials (pos 10–13): each scroll step reveals the next quote.
      const tp = Math.max(0, Math.min(TESTI_COUNT, totalPos - 10));
      const revealedNow = Math.min(TESTI_COUNT, Math.floor(tp + 0.5));
      if (revealedNow !== revealedRef.current) {
        revealedRef.current = revealedNow;
        setRevealed(revealedNow);
      }

      // Donut (pos 14–17)
      const rankIdx = Math.round(
        Math.max(0, Math.min(RANK_SEGMENTS.length - 1, totalPos - 14))
      );
      if (rankIdx !== rankActiveRef.current) {
        rankActiveRef.current = rankIdx;
        setRankActive(rankIdx);
      }

      // Plans (pos 18–21)
      const planIdx = Math.round(
        Math.max(0, Math.min(PLANS.length - 1, totalPos - 18))
      );
      if (planIdx !== planActiveRef.current) {
        planActiveRef.current = planIdx;
        setPlanActive(planIdx);
      }

      if (snapRef.current) clearTimeout(snapRef.current);
      snapRef.current = setTimeout(() => {
        const lastSnap = 24;
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
  }, [smoothScrollTo, scrollAnimRef]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-10 bg-white h-[72px] flex items-center justify-between px-4">
        <span className="text-base font-medium">Mendr Pro</span>
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
                <h1 className="text-2xl font-semibold text-center">Header Name</h1>
                <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
              </div>
              <Button asChild variant="secondary">
                <Link href={JOIN_HREF}>Join Mendr Pro</Link>
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

        {/* Your Toolkit — sticky over 4 screens; scroll steps each item. */}
        <div className="relative h-[calc(400dvh-288px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
              </div>
              <ScrollAccordion
                items={TOOLKIT}
                active={toolkitActive}
                onSelect={(i) => goTo(4 + i)}
              />
            </div>
            <div className="p-4 shrink-0">
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* Built for Every Trade — pos 8 (drifting badges, placeholder labels) */}
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

            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {bubbles.map((b, i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${b.x}px`, top: `${b.y}px` }}
                >
                  <span
                    className="lb-x inline-block"
                    style={
                      {
                        animation: `lb-wx ${b.durX}s ${b.easeX} ${b.delayX}s infinite`,
                        willChange: 'transform',
                        '--x0': `${b.xs[0]}px`,
                        '--x1': `${b.xs[1]}px`,
                        '--x2': `${b.xs[2]}px`,
                        '--x3': `${b.xs[3]}px`,
                        '--x4': `${b.xs[4]}px`,
                      } as CSSProperties
                    }
                  >
                    <span
                      className="lb-y inline-block"
                      style={
                        {
                          animation: `lb-wy ${b.durY}s ${b.easeY} ${b.delayY}s infinite`,
                          willChange: 'transform',
                          '--y0': `${b.ys[0]}px`,
                          '--y1': `${b.ys[1]}px`,
                          '--y2': `${b.ys[2]}px`,
                          '--y3': `${b.ys[3]}px`,
                          '--y4': `${b.ys[4]}px`,
                        } as CSSProperties
                      }
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
              <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
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
            <Button variant="secondary" className="w-full" onClick={() => goTo(9)}>
              Continue
            </Button>
          </div>
        </section>

        {/* Stats — pos 9 (two cards flex across + a big block) */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col p-4 gap-8 min-h-0">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 shrink-0">
              {STATS.map((s, i) => (
                <div
                  key={i}
                  className="bg-secondary rounded-lg h-[104px] flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-3xl font-semibold">{s.value}</span>
                  <span className="text-xs text-muted-foreground text-center">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0 bg-secondary rounded-lg" />
          </div>

          <div className="p-4 shrink-0">
            <Button variant="secondary" className="w-full" onClick={() => goTo(10)}>
              Continue
            </Button>
          </div>
        </section>

        {/* Testimonials — sticky; each scroll step reveals the next quote. */}
        <div
          className="relative"
          style={{
            height: `calc(${(TESTI_COUNT + 1) * 100}dvh - ${(TESTI_COUNT + 1) * 72}px)`,
          }}
        >
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
              <div className="flex flex-col items-center gap-8 w-full">
                <div className="flex flex-col items-center gap-2">
                  <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                  <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
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

              <div className="flex flex-col items-center w-full">
                {TESTIMONIALS.map((t, i) => (
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
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* How You Rank — sticky over 4 screens; scroll advances the donut slice. */}
        <div className="relative h-[calc(400dvh-288px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col p-4 gap-8 min-h-0">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
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

            <ScrollDonut segments={RANK_SEGMENTS} active={rankActive} />

            <div className="p-4 shrink-0">
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* Plans — sticky over 4 screens; scroll steps the highlighted card. */}
        <div className="relative h-[calc(400dvh-288px)]">
          <div className="sticky top-0 h-[calc(100dvh-72px)] flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 min-h-0">
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h2 className="text-2xl font-semibold text-center">Header Name</h2>
                <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
              </div>

              {/* Monthly / Annual toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setAnnual(false)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    annual ? 'text-muted-foreground' : 'bg-white text-foreground shadow-sm'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setAnnual(true)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    annual ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Annual
                </button>
              </div>

              <div className="flex flex-col gap-4 w-full max-w-md">
                {PLANS.map((p, i) => {
                  const isActive = i === planActive;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg p-6 transition-all duration-300 ${
                        isActive ? 'bg-secondary' : 'border border-border'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3
                          className={`text-lg font-semibold transition-colors duration-300 ${
                            isActive ? 'text-foreground' : 'text-foreground/50'
                          }`}
                        >
                          {p.name}
                        </h3>
                        <span
                          className={`text-sm font-medium transition-colors duration-300 ${
                            isActive ? 'text-foreground' : 'text-foreground/50'
                          }`}
                        >
                          {annual ? p.priceAnnual : p.priceMonthly}
                          <span className="text-muted-foreground">
                            {annual ? '/yr' : '/mo'}
                          </span>
                        </span>
                      </div>
                      <div
                        className="grid transition-[grid-template-rows] duration-300 ease-out"
                        style={{ gridTemplateRows: isActive ? '1fr' : '0fr' }}
                      >
                        <div className="overflow-hidden">
                          <ul className="flex flex-col gap-2 pt-4">
                            {p.features.map((f, j) => (
                              <li key={j} className="text-sm text-muted-foreground">
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 shrink-0">
              <Button variant="secondary" className="w-full" onClick={scrollNext}>
                Continue
              </Button>
            </div>
          </div>
        </div>

        {/* FAQ — pos 22 (boxless accordion) */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8 min-h-0">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
            </div>
            <FaqList items={FAQS} />
          </div>
          <div className="p-4 shrink-0">
            <Button variant="secondary" className="w-full" onClick={() => goTo(23)}>
              Continue
            </Button>
          </div>
        </section>

        {/* Contact — pos 23 (same as the homeowner contact page) */}
        <section className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 min-h-0">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <h2 className="text-2xl font-semibold text-center">Header Name</h2>
              <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
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
            <Button variant="secondary" className="w-full" onClick={() => goTo(24)}>
              Continue
            </Button>
          </div>
        </section>

        {/* Footer — pos 24 */}
        <footer className="h-[calc(100dvh-72px)] flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
            <div className="flex flex-col items-center gap-2 max-w-md">
              <Link
                href={JOIN_HREF}
                className="text-2xl font-semibold text-center hover:underline"
              >
                Join Mendr Pro
              </Link>
              <p className="text-sm text-muted-foreground text-center">{LOREM}</p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-4 px-4 pb-4 overflow-hidden">
            <Link href="/landing1" className="text-lg font-semibold">
              For Homeowners
            </Link>
            <FullWidthWordmark
              text="Mendr"
              className="w-full fill-foreground opacity-25"
            />
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
