'use client';

/**
 * Marketing craft primitives.
 *
 * Shared across homepage and contractor pages. Built around the /branding rules:
 *   - Editorial, not SaaS — content carries weight, chrome is restrained
 *   - Lines, not shadows — hairlines divide; shadows reserved for overlays
 *   - One signal — primary lime appears sparingly, never on chrome
 *   - Default tracking — no tracking-tight, no uppercase-with-extra-tracking
 *   - Calm motion — 150–220ms ease-out, no springs, no motion on diagnosis path
 *
 * The marketing surface is allowed motion. Diagnosis path is not.
 */

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────
 * Motion
 * ──────────────────────────────────────────────────────────────────────── */

const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: REVEAL_EASE } },
};

/** Sequence container — staggers its direct motion children. */
const stagger: Variants = {
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export function Reveal({
    as = 'div',
    delay = 0,
    children,
    className,
    once = true,
}: {
    as?: 'div' | 'section' | 'header' | 'article' | 'ol' | 'ul' | 'li' | 'figure';
    delay?: number;
    children: ReactNode;
    className?: string;
    once?: boolean;
}) {
    const MotionTag = motion[as] as typeof motion.div;
    return (
        <MotionTag
            initial="hidden"
            whileInView="visible"
            viewport={{ once, margin: '-80px' }}
            variants={{
                hidden: { opacity: 0, y: 14 },
                visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.55, ease: REVEAL_EASE, delay },
                },
            }}
            className={className}
        >
            {children}
        </MotionTag>
    );
}

export function Stagger({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <motion.div variants={fadeUp} className={className}>
            {children}
        </motion.div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Section eyebrow — "01 · WHAT WE COVER · WESTERN CAPE"
 * Pinned to the left edge of a section, mono, sentence-case (no extra tracking).
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionEyebrow({
    index,
    label,
    meta,
}: {
    index: string;
    label: string;
    meta?: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground">{index}</span>
            <span aria-hidden="true">·</span>
            <span>{label}</span>
            {meta && (
                <>
                    <span aria-hidden="true">·</span>
                    <span>{meta}</span>
                </>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Editorial section header
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionHeader({
    eyebrowIndex,
    eyebrowLabel,
    eyebrowMeta,
    title,
    lede,
    align = 'left',
    headingSize = 'lg',
}: {
    eyebrowIndex: string;
    eyebrowLabel: string;
    eyebrowMeta?: string;
    title: ReactNode;
    lede?: ReactNode;
    align?: 'left' | 'center';
    headingSize?: 'md' | 'lg' | 'xl';
}) {
    const sizeClass =
        headingSize === 'xl'
            ? 'text-4xl sm:text-5xl lg:text-6xl'
            : headingSize === 'lg'
            ? 'text-3xl sm:text-4xl lg:text-5xl'
            : 'text-2xl sm:text-3xl';
    return (
        <header
            className={[
                'max-w-3xl space-y-5',
                align === 'center' ? 'mx-auto text-center' : '',
            ].join(' ')}
        >
            <div className={align === 'center' ? 'flex justify-center' : ''}>
                <SectionEyebrow index={eyebrowIndex} label={eyebrowLabel} meta={eyebrowMeta} />
            </div>
            <h2 className={`${sizeClass} font-semibold leading-[1.05] text-foreground`}>{title}</h2>
            {lede && (
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>
            )}
        </header>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Corner-bracketed surface — adds four thin L-brackets at the corners
 * Used for cards we want to feel "marked up" rather than plain.
 * ──────────────────────────────────────────────────────────────────────── */

export function CornerBrackets({ className }: { className?: string }) {
    const arm = 'absolute size-3 border-foreground';
    return (
        <span aria-hidden="true" className={['pointer-events-none', className].join(' ')}>
            <span className={`${arm} left-0 top-0 border-l border-t`} />
            <span className={`${arm} right-0 top-0 border-r border-t`} />
            <span className={`${arm} bottom-0 left-0 border-b border-l`} />
            <span className={`${arm} bottom-0 right-0 border-b border-r`} />
        </span>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Intentional image placeholder
 * Not a grey block — a labelled spec card that designers can replace later.
 * Shows ratio, treatment, caption, and an editorial frame.
 * ──────────────────────────────────────────────────────────────────────── */

export function ImageSlot({
    label,
    caption,
    ratio = 'aspect-[4/3]',
    treatment = 'Photograph',
    className,
}: {
    label: string;
    caption?: string;
    ratio?: string;
    treatment?: 'Photograph' | 'Illustration' | 'Diagram' | 'Screenshot';
    className?: string;
}) {
    return (
        <figure className={['group relative', className].join(' ')}>
            <div
                className={[
                    'relative overflow-hidden rounded-xl border border-border bg-muted/50',
                    ratio,
                ].join(' ')}
            >
                {/* Diagonal hatch indicating an intentional placeholder */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            'repeating-linear-gradient(135deg, color-mix(in oklab, currentColor 4%, transparent) 0 1px, transparent 1px 14px)',
                        color: 'var(--foreground)',
                    }}
                    aria-hidden="true"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <Camera
                        className="size-9 text-muted-foreground/60"
                        strokeWidth={1.5}
                        aria-hidden="true"
                    />
                </div>
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                    {treatment}
                </span>
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                    {ratio.replace('aspect-[', '').replace(']', '').replace('aspect-', '')}
                </span>
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between gap-4 text-xs">
                <span className="text-foreground">{label}</span>
                {caption && <span className="font-mono text-muted-foreground">{caption}</span>}
            </figcaption>
        </figure>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Device frame — phone outline for product mockups
 * ──────────────────────────────────────────────────────────────────────── */

export function DeviceFrame({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={[
                'relative mx-auto w-full max-w-[340px] rounded-[2.4rem] border border-foreground/12 bg-foreground/[0.02] p-2',
                className,
            ].join(' ')}
        >
            <div className="absolute left-1/2 top-2.5 z-10 h-1.5 w-20 -translate-x-1/2 rounded-full bg-foreground/15" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[1.9rem] border border-border bg-card">
                {children}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Marquee — infinite horizontal scroll. Used for suburb names.
 * No spring; pure linear transform.
 * ──────────────────────────────────────────────────────────────────────── */

export function Marquee({
    items,
    speedSeconds = 60,
    className,
}: {
    items: readonly string[];
    speedSeconds?: number;
    className?: string;
}) {
    // Duplicate items so the scroll wraps cleanly.
    const loop = [...items, ...items];
    return (
        <div
            className={[
                'relative overflow-hidden border-y border-border bg-background',
                className,
            ].join(' ')}
            aria-hidden="true"
        >
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
            <div
                className="flex gap-12 whitespace-nowrap py-5 text-sm font-medium text-muted-foreground"
                style={{ animation: `mendr-marquee ${speedSeconds}s linear infinite` }}
            >
                {loop.map((item, i) => (
                    <span key={`${item}-${i}`} className="inline-flex items-center gap-12">
                        <span>{item}</span>
                        <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                    </span>
                ))}
            </div>
            <style>{`
                @keyframes mendr-marquee {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Streaming text — types in a sequence of lines with a caret.
 * Used in the hero "live diagnosis" moment.
 * ──────────────────────────────────────────────────────────────────────── */

export function StreamingLines({
    lines,
    className,
}: {
    lines: readonly string[];
    className?: string;
}) {
    return (
        <div className={['space-y-2', className].join(' ')}>
            {lines.map((line, i) => (
                <div
                    key={line}
                    className="flex items-baseline gap-2 text-sm text-foreground"
                    style={{
                        animation: 'mendr-stream-in 4s ease-out infinite',
                        animationDelay: `${i * 1.1}s`,
                        opacity: 0,
                    }}
                >
                    <span>{line}</span>
                    {i === lines.length - 1 && (
                        <span
                            className="inline-block h-3 w-[2px] bg-foreground"
                            style={{ animation: 'mendr-caret 1s steps(2) infinite' }}
                            aria-hidden="true"
                        />
                    )}
                </div>
            ))}
            <style>{`
                @keyframes mendr-stream-in {
                    0%   { opacity: 0; transform: translateY(2px); }
                    10%  { opacity: 1; transform: translateY(0); }
                    85%  { opacity: 1; }
                    100% { opacity: 0; }
                }
                @keyframes mendr-caret {
                    0%, 49%   { opacity: 1; }
                    50%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Display numerals — for stat ribbons, section numbers, prices.
 * ──────────────────────────────────────────────────────────────────────── */

export function DisplayNumeral({
    value,
    unit,
    label,
    align = 'left',
}: {
    value: string;
    unit?: string;
    label: string;
    align?: 'left' | 'center';
}) {
    return (
        <div
            className={[
                'space-y-2',
                align === 'center' ? 'text-center' : '',
            ].join(' ')}
        >
            <div className="flex items-baseline gap-1">
                <span className="text-5xl font-semibold leading-[0.95] text-foreground sm:text-6xl">
                    {value}
                </span>
                {unit && (
                    <span className="text-base font-medium text-muted-foreground">{unit}</span>
                )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Pull-quote — editorial block-quote for testimonials and section emphasis
 * ──────────────────────────────────────────────────────────────────────── */

export function PullQuote({
    quote,
    attribution,
    location,
}: {
    quote: string;
    attribution: string;
    location?: string;
}) {
    return (
        <figure className="relative space-y-5 border-t border-border bg-card p-7">
            <span
                aria-hidden="true"
                className="absolute -top-3 left-6 font-mono text-xs text-muted-foreground"
            >
                ↳ Quote
            </span>
            <blockquote className="text-lg leading-relaxed text-foreground">
                <span className="text-foreground/40">&ldquo;</span>
                {quote}
                <span className="text-foreground/40">&rdquo;</span>
            </blockquote>
            <figcaption className="flex items-center gap-3 border-t border-border pt-4 text-sm">
                <span className="size-8 shrink-0 rounded-full border border-border bg-muted" aria-hidden="true" />
                <span>
                    <span className="font-medium text-foreground">{attribution}</span>
                    {location && (
                        <>
                            <span className="px-1.5 text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{location}</span>
                        </>
                    )}
                </span>
            </figcaption>
        </figure>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Section frame — uniform vertical rhythm + optional dark/contrast band
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionFrame({
    id,
    tone = 'canvas',
    children,
    className,
}: {
    id?: string;
    tone?: 'canvas' | 'muted' | 'ink' | 'paper';
    children: ReactNode;
    className?: string;
}) {
    const toneClass =
        tone === 'ink'
            ? 'bg-foreground text-background border-y border-border'
            : tone === 'muted'
            ? 'bg-muted/40 border-y border-border'
            : tone === 'paper'
            ? 'bg-card border-y border-border'
            : 'bg-background border-b border-border';
    return (
        <section
            id={id}
            className={[
                'scroll-mt-20 py-20 sm:py-28 lg:py-32',
                toneClass,
                className,
            ].join(' ')}
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
        </section>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Edge meta strip — horizontal hairline-bordered row of mono labels
 * Used as a "this is what we promise" bar under hero
 * ──────────────────────────────────────────────────────────────────────── */

export function MetaStrip({ items }: { items: ReadonlyArray<{ k: string; v: string }> }) {
    return (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {items.map((it) => (
                <div key={it.k} className="flex flex-col gap-1 bg-background px-5 py-4">
                    <p className="font-mono text-[10px] text-muted-foreground">{it.k}</p>
                    <p className="text-base font-medium text-foreground">{it.v}</p>
                </div>
            ))}
        </div>
    );
}
