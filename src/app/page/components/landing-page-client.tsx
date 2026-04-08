'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { ContactForm } from '@/components/contact-form';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';

// ── Animation variants ────────────────────────────────────────────────────────

const problemStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.2, delayChildren: 0.1 } },
};

const problemItem = {
    hidden: { opacity: 0, y: 28 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
    },
};

// ── Data ──────────────────────────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS = [
    {
        watermark: '01',
        step: '1',
        title: 'Capture Fault',
        body: 'Photograph what you see—leaks, cracks, wiring, or anything that is not right. Add a short note if the photo alone does not tell the full story.',
    },
    {
        watermark: '02',
        step: '2',
        title: 'Receive Scandio Report',
        body: 'Get a structured report with a clear read on the fault, likely causes, and practical next steps. It is a professional starting point, not a substitute for an on-site inspection.',
    },
    {
        watermark: '03',
        step: '3',
        title: 'Connect with Local Contractors',
        body: 'Share your report with vetted pros across the Western Cape. Everyone sees the same picture and the same brief—so comparing quotes is simpler and faster.',
    },
] as const;

/** Replace hrefs with your real profiles when ready. */
const SOCIAL_LINKS: { Icon: LucideIcon; href: string; label: string }[] = [
    { Icon: Instagram, href: 'https://www.instagram.com/', label: 'Instagram' },
    { Icon: Linkedin, href: 'https://www.linkedin.com/', label: 'LinkedIn' },
    { Icon: Twitter, href: 'https://twitter.com/', label: 'Twitter' },
    { Icon: Facebook, href: 'https://www.facebook.com/', label: 'Facebook' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StepWatermark({ n }: { n: string }) {
    return (
        <span
            className="absolute -top-8 -left-1 text-[96px] font-bold leading-none pointer-events-none select-none"
            aria-hidden="true"
        >
            <motion.span
                initial={false}
                animate={{ opacity: 0.05 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="block text-foreground"
            >
                {n}
            </motion.span>
        </span>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function LandingPageClient() {
    useEffect(() => {
        // Defensive cleanup: if the upload flow was interrupted, clear any leftover global scroll lock.
        document.documentElement.classList.remove('welcome-scroll-lock');
        document.body.classList.remove('welcome-scroll-lock');
        document.documentElement.style.touchAction = '';
        document.body.style.touchAction = '';
    }, []);

    return (
        <div className="flex min-h-screen flex-col bg-background">
                <LandingHeader
                    navLinks={[
                        { href: '#how-it-works', label: 'How It Works' },
                        { href: '#contact', label: 'Contact' },
                        { href: '/pro/join', label: 'For Pros' },
                    ]}
                    logoHref="/"
                    showTrades={false}
                />

                <main className="flex-1">
                    {/* ── Hero ──────────────────────────────────────────────── */}
                    <section id="hero" className="relative overflow-hidden">
                        {/* Dot-grid texture — adapts to light/dark via --foreground */}
                        <div
                            className="absolute inset-0 pointer-events-none"
                            aria-hidden="true"
                            style={{
                                backgroundImage:
                                    'radial-gradient(circle, var(--foreground) 1px, transparent 1px)',
                                backgroundSize: '24px 24px',
                                opacity: 0.025,
                            }}
                        />

                        <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
                            <div className="grid items-center gap-14 lg:grid-cols-[3fr_2fr] lg:gap-16">
                                {/* — Text column — */}
                                <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
                                    {/* Hero copy is static so the headline and subhead paint immediately (LCP); motion is reserved for the mockup. */}
                                    <h1 className="text-4xl font-bold tracking-tight">
                                        Snap. Diagnose. Done.
                                    </h1>

                                    <p className="text-base text-muted-foreground max-w-3xl">
                                        Upload a photo of the issue. Scandio turns it into a clear,
                                        shareable report for you and Western Cape contractors—free,
                                        with no account required.
                                    </p>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                        <Button asChild size="lg">
                                            <Link href="/welcome">Generate Free Scandio Report</Link>
                                        </Button>
                                        <Button variant="ghost" className="text-sm h-10" asChild>
                                            <Link href="#how-it-works">
                                                How Scandio Works
                                            </Link>
                                        </Button>
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        No Registration Required&nbsp;&middot;&nbsp;Generate Free Reports
                                    </p>
                                </div>

                                {/* — Phone mockup — */}
                                <div className="flex justify-center">
                                    <motion.div
                                        initial={{ opacity: 0, x: 0, y: 50 }}
                                        animate={{ opacity: 1, x: 0, y: 0 }}
                                        transition={{
                                            duration: 0.85,
                                            ease: [0.25, 1, 0.50, 1],
                                            delay: 0.25,
                                        }}
                                        className="relative"
                                    >
                                        {/* Glow — single entrance, then holds static */}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{
                                                duration: 4,
                                                ease: 'easeOut',
                                                delay: 1,
                                            }}
                                            className="absolute inset-0 -z-10 pointer-events-none"
                                            aria-hidden="true"
                                            style={{
                                                background:
                                                    'radial-gradient(ellipse at 50% 50%, oklch(0.72 0.17 142 / 0.08), transparent 70%)',
                                                transform: 'scale(1.65)',
                                                borderRadius: '2rem',
                                            }}
                                        />

                                        {/* Phone frame */}
                                        <div className="relative w-[324px] overflow-hidden">
                                            <Placeholder
                                                label=""
                                                aspectRatio="aspect-[9/16]"
                                                className="w-full rounded-lg"
                                            />
                                        </div>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── Problem Section ───────────────────────────────────── */}
                    <section className="bg-foreground py-20">
                        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                            <motion.div
                                variants={problemStagger}
                                initial="visible"
                                animate="visible"
                                className="mx-auto flex max-w-3xl flex-col gap-6 text-center text-foreground"
                            >
                                {[
                                    'Explaining the same fault to three different contractors is tiring.',
                                    'Scandio gives everyone the same photo and the same brief—so quotes are easier to compare.',
                                ].map((statement) => (
                                    <motion.p
                                        key={statement}
                                        variants={problemItem}
                                        className="text-2xl font-bold text-white"
                                    >
                                        {statement}
                                    </motion.p>
                                ))}

                                <motion.p
                                    variants={problemItem}
                                    className="text-base font-semibold mt-6 text-white"
                                >
                                    One report. One link. Less back-and-forth before anyone steps
                                    onto your property.
                                </motion.p>
                            </motion.div>
                        </div>
                    </section>

                    {/* ── How It Works ──────────────────────────────────────── */}
                    <section
                        id="how-it-works"
                        className="py-20 scroll-mt-16"
                    >
                        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                            <div className="mb-12 text-center sm:mb-16">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                    How Scandio Works
                                </h2>
                                <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-foreground/80">
                                    From a single photo to a report you can send anywhere—three
                                    steps, no guesswork about what to say on the phone.
                                </p>
                            </div>

                            {/* Mobile: flex-col, copy then image (no grid order). lg+: grid + order for alternating sides. */}
                            <div className="flex w-full flex-col gap-16 sm:gap-20 lg:gap-24">
                                {HOW_IT_WORKS_STEPS.map(({ watermark, step, title, body }, index) => {
                                    const reverse = index % 2 === 1;
                                    return (
                                        <motion.article
                                            key={watermark}
                                            className="relative flex min-w-0 flex-col gap-10 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center"
                                            initial={{ opacity: 1, y: 0 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                duration: 0.2,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                        >
                                            {/* Mobile: DOM order is always copy → image. lg+: `order` only swaps columns when alternating. */}
                                            <div
                                                className={
                                                    reverse
                                                        ? 'relative min-w-0 space-y-4 pt-10 lg:order-2'
                                                        : 'relative min-w-0 space-y-4 pt-10'
                                                }
                                            >
                                                <StepWatermark n={watermark} />
                                                <span className="text-xs font-semibold uppercase tracking-widest text-foreground/80">
                                                    Step {step}
                                                </span>
                                                <h3 className="text-xl font-semibold">{title}</h3>
                                                <p className="-mt-2 text-base leading-relaxed text-foreground/80">
                                                    {body}
                                                </p>
                                            </div>
                                            <div
                                                className={
                                                    reverse
                                                        ? 'min-w-0 w-full lg:order-1 lg:pt-10'
                                                        : 'min-w-0 w-full lg:pt-10'
                                                }
                                            >
                                                <Placeholder
                                                    label=""
                                                    aspectRatio="aspect-[4/3]"
                                                    className="w-full rounded-lg"
                                                />
                                            </div>
                                        </motion.article>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* ── Contact form ─────────────────────────────────────── */}
                    <section
                        id="contact"
                        className="border-t border-border/50 bg-muted/20 py-16 scroll-mt-16 sm:py-20"
                    >
                        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
                            <div className="mb-10 text-center sm:text-left">
                                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                    Contact us
                                </h2>
                                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:mx-0">
                                    Homeowner, contractor, or curious—we read every message.
                                </p>
                            </div>
                            <ContactForm fieldIdPrefix="landing-contact" />
                        </div>
                    </section>
                </main>

                <footer className="border-t border-border/50 bg-background py-8">
                    <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3">
                            {SOCIAL_LINKS.map(({ Icon, href, label }) => (
                                <a
                                    key={label}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex size-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                                    aria-label={label}
                                >
                                    <Icon className="size-[18px]" aria-hidden />
                                </a>
                            ))}
                        </div>
                        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                            <Link href="/privacy" className="hover:text-foreground transition-colors">
                                Privacy
                            </Link>
                            <Link href="/terms" className="hover:text-foreground transition-colors">
                                Terms
                            </Link>
                            <Link href="/#contact" className="hover:text-foreground transition-colors">
                                Contact
                            </Link>
                        </nav>
                        <p className="text-center text-xs text-muted-foreground">
                            &copy; {new Date().getFullYear()} Scandio
                        </p>
                    </div>
                </footer>
        </div>
    );
}
