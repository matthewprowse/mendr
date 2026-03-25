'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { motion, MotionConfig, AnimatePresence } from 'framer-motion';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { StartDiagnosisButton } from '@/app/page/_components/start-diagnosis-button';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

// ── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
    hidden: { opacity: 0, y: 22 },
    visible: (delay = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const, delay },
    }),
};

const slideLeft = {
    hidden: { opacity: 0, x: -44 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
    },
};

const slideRight = {
    hidden: { opacity: 0, x: 44 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
    },
};

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

const bentoStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const bentoItem = {
    hidden: { opacity: 0, y: 18 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    },
};

// ── Data ──────────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: 'Is the Scandio Report really free?',
        a: 'Yes. Generating a Scandio Report costs nothing. You only pay when a contractor you choose does the work — we never take a commission.',
    },
    {
        q: 'How accurate is the AI diagnosis?',
        a: "Scandio uses vision AI to analyse your photo and context and produce a professional starting point diagnosis. It is not a substitute for a qualified tradesperson's physical inspection, but it gives you and your contractor a clear, informed place to start.",
    },
    {
        q: 'Can I share the report with multiple contractors?',
        a: 'Absolutely. Your Scandio Report has a secure shareable link and a WhatsApp-ready summary. Send it to as many contractors as you like to get competing quotes.',
    },
    {
        q: 'Which areas do you cover?',
        a: 'We currently serve homeowners across the Western Cape, with contractor coverage from Cape Town through to Stellenbosch, Paarl, and Somerset West.',
    },
    {
        q: 'What types of home repairs can Scandio diagnose?',
        a: 'Plumbing, electrical, roofing, painting, tiling, carpentry, appliances, HVAC, and more. If it can break, Scandio can diagnose it.',
    },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function BentoCell({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <motion.div
            variants={bentoItem}
            className={[
                'group flex flex-col overflow-hidden rounded-xl',
                'border border-black/[0.06] dark:border-white/[0.06]',
                'bg-background transition-colors duration-150',
                'hover:bg-[#F8F8F8] dark:hover:bg-white/[0.025]',
                className,
            ].join(' ')}
        >
            {children}
        </motion.div>
    );
}

function BentoCellFooter({ title, description }: { title: string; description: string }) {
    return (
        <div className="shrink-0 flex flex-col gap-1 p-4 border-t border-black/[0.06] dark:border-white/[0.06]">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
    );
}

function StepWatermark({ n }: { n: string }) {
    return (
        <span
            className="absolute -top-8 -left-1 text-[96px] font-bold leading-none pointer-events-none select-none"
            aria-hidden="true"
        >
            <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 0.05 }}
                transition={{ duration: 0.85, ease: 'easeOut', delay: 0.25 }}
                viewport={{ once: true }}
                className="block text-foreground"
            >
                {n}
            </motion.span>
        </span>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function LandingPageClient() {
    const [openFaq, setOpenFaq] = useState<string | null>(null);

    return (
        <MotionConfig reducedMotion="never">
            <div className="flex min-h-screen flex-col bg-background">
                <LandingHeader
                    navLinks={[
                        { href: '#how-it-works', label: 'How It Works' },
                        { href: '#features', label: 'Features' },
                        { href: '#faq', label: 'FAQ' },
                        { href: '/pro/join', label: 'For Pros' },
                    ]}
                    logoHref="/landing"
                    showTrades={false}
                    rightSlot={<ThemeToggle />}
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
                                opacity: 0.027,
                            }}
                        />

                        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
                            <div className="grid items-center gap-14 lg:grid-cols-[3fr_2fr] lg:gap-16">
                                {/* — Text column — */}
                                <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
                                    {/* H1 */}
                                    <motion.h1
                                        variants={fadeUp}
                                        initial="hidden"
                                        animate="visible"
                                        custom={0.25}
                                        className="text-3xl font-bold"
                                    >
                                        Something Broken?
                                        <br></br>
                                        Diagnose It, Before Calling Anyone. 
                                    </motion.h1>

                                    {/* Subheadline */}
                                    <motion.p
                                        variants={fadeUp}
                                        initial="hidden"
                                        animate="visible"
                                        custom={0.25}
                                        className="text-base text-muted-foreground max-w-lg"
                                    >
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque sollicitudin ligula mi, vitae suscipit lacus commodo a. Pellentesque ac lacus in elit dapibus auctor non at risus. Nunc ante ante, faucibus ullamcorper lobortis vulputate, ultrices et sem.
                                    </motion.p>

                                    {/* CTAs */}
                                    <motion.div
                                        variants={fadeUp}
                                        initial="hidden"
                                        animate="visible"
                                        custom={0.25}
                                        className="flex flex-col gap-3 sm:flex-row sm:items-center"
                                    >
                                        <StartDiagnosisButton size="lg">
                                            Generate Free Scandio Report
                                        </StartDiagnosisButton>
                                        <Button variant="ghost" className="text-sm h-10" asChild>
                                            <Link href="#how-it-works">
                                                How Scandio Works
                                            </Link>
                                        </Button>
                                    </motion.div>

                                    {/* Trust line */}
                                    <motion.p
                                        variants={fadeUp}
                                        initial="hidden"
                                        animate="visible"
                                        custom={0.50}
                                        className="text-xs text-muted-foreground"
                                    >
                                        No Registration Required&nbsp;&middot;&nbsp;Generate Free Reports
                                    </motion.p>
                                </div>

                                {/* — Phone mockup — */}
                                <div className="flex justify-center">
                                    <motion.div
                                        initial={{ opacity: 0, x: 32 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            duration: 0.85,
                                            ease: [0.22, 1, 0.36, 1],
                                            delay: 0.25,
                                        }}
                                        className="relative"
                                    >
                                        {/* Glow — single entrance, then holds static */}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{
                                                duration: 2,
                                                ease: 'easeOut',
                                                delay: 0.9,
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
                                                className="w-full"
                                            />
                                        </div>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── Problem Section ───────────────────────────────────── */}
                    <section className="bg-foreground py-20">
                        <div className="mx-auto max-w-4xl px-4">
                            <motion.div
                                variants={problemStagger}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-72px' }}
                                className="flex flex-col gap-6 text-foreground text-center"
                            >
                                {[
                                    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
                                    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                                ].map((statement) => (
                                    <motion.p
                                        key={statement}
                                        variants={problemItem}
                                        className="text-3xl font-bold text-white"
                                    >
                                        {statement}
                                    </motion.p>
                                ))}

                                <motion.p
                                    variants={problemItem}
                                    className="text-xl font-semibold mt-6"
                                    style={{ color: 'white' }}
                                >
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                </motion.p>
                            </motion.div>
                        </div>
                    </section>

                    {/* ── How It Works ──────────────────────────────────────── */}
                    <section
                        id="how-it-works"
                        className="py-20 scroll-mt-16"
                    >
                        <div className="mx-auto max-w-7xl px-4">
                            <div className="mb-20 text-center">
                                <h2 className="text-2xl font-bold">
                                    How Scandio Works
                                </h2>
                                <p className="text-base text-muted-foreground mx-auto max-w-2xl mt-2">
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                                </p>
                            </div>

                            <div className="relative flex flex-col gap-12">
                                {/* Connecting line — center vertical, desktop only */}
                                <div
                                    className="absolute hidden lg:block top-6 bottom-6 left-1/2 -translate-x-1/2 w-px bg-border/40"
                                    aria-hidden="true"
                                />

                                {/* Step 1 — text left, mockup right */}
                                <motion.div
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true, margin: '-72px' }}
                                    className="grid items-center gap-6 lg:grid-cols-2 lg:gap-20"
                                >
                                    <motion.div
                                        variants={slideLeft}
                                        className="relative space-y-4 order-2 lg:order-1 pt-10"
                                    >
                                        <StepWatermark n="01" />
                                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Step 1
                                        </span>
                                        <h3 className="text-xl font-semibold">Capture Your Fault</h3>
                                        <p className="text-base text-muted-foreground leading-relaxed">
                                            Take a photo of your maintenance issue or describe it in
                                            plain language. Scandio&apos;s AI identifies the fault
                                            type, analyses the visible symptoms in real-time, and
                                            gives you an accurate, professional starting point — no
                                            technical knowledge required.
                                        </p>
                                    </motion.div>
                                    <motion.div
                                        variants={slideRight}
                                        className="order-1 lg:order-2"
                                    >
                                        <Placeholder
                                            label="Mobile screen showing a photo upload interface with a plumbing fault captured by the camera"
                                            aspectRatio="aspect-[4/3]"
                                            className="w-full rounded-xl"
                                        />
                                    </motion.div>
                                </motion.div>

                                {/* Step 2 — mockup left, text right */}
                                <motion.div
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true, margin: '-60px' }}
                                    className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
                                >
                                    <motion.div variants={slideLeft}>
                                        <Placeholder
                                            label="Mobile screen showing the Scandio Report with fault title, root cause analysis, and a cost range of R1 200 to R2 400"
                                            aspectRatio="aspect-[4/3]"
                                            className="w-full rounded-xl"
                                        />
                                    </motion.div>
                                    <motion.div
                                        variants={slideRight}
                                        className="relative space-y-4 pt-10"
                                    >
                                        <StepWatermark n="02" />
                                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Step 2
                                        </span>
                                        <h3 className="text-xl font-semibold">
                                            Receive Your Scandio Report
                                        </h3>
                                        <p className="text-base text-muted-foreground leading-relaxed">
                                            Within seconds you&apos;ll receive an expert-level home
                                            repair analysis including a fault summary, likely root
                                            causes, and an estimated cost range. Your free Scandio
                                            Report is securely stored and ready to share — it&apos;s
                                            your asset to keep.
                                        </p>
                                    </motion.div>
                                </motion.div>

                                {/* Step 3 — text left, mockup right */}
                                <motion.div
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true, margin: '-60px' }}
                                    className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
                                >
                                    <motion.div
                                        variants={slideLeft}
                                        className="relative space-y-4 order-2 lg:order-1 pt-10"
                                    >
                                        <StepWatermark n="03" />
                                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Step 3
                                        </span>
                                        <h3 className="text-xl font-semibold">
                                            Connect with Local Contractors
                                        </h3>
                                        <p className="text-base text-muted-foreground leading-relaxed">
                                            Choose which local contractors receive your Scandio
                                            Report. Share via a secure link or a WhatsApp-ready
                                            summary so they arrive informed, prepared, and able to
                                            resolve the issue on the first visit. You stay in control.
                                        </p>
                                    </motion.div>
                                    <motion.div
                                        variants={slideRight}
                                        className="order-1 lg:order-2"
                                    >
                                        <Placeholder
                                            label="Mobile screen showing a list of local Western Cape contractors with ratings, distance, and contact buttons"
                                            aspectRatio="aspect-[4/3]"
                                            className="w-full rounded-xl"
                                        />
                                    </motion.div>
                                </motion.div>
                            </div>
                        </div>
                    </section>

                    {/* ── Features Bento ────────────────────────────────────── */}
                    <section
                        id="features"
                        className="bg-muted/30 py-20 scroll-mt-16"
                    >
                        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                            <div className="mb-14 text-center">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                    Everything You Need, Nothing You Don&apos;t
                                </h2>
                                <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                    Scandio gives you the information and tools professionals use,
                                    without the jargon or the guesswork.
                                </p>
                            </div>

                            <motion.div
                                variants={bentoStagger}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-60px' }}
                                className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:grid-rows-3"
                            >
                                {/* Scandio Report — hero card: 2 cols × 2 rows */}
                                <BentoCell className="lg:col-span-2 lg:row-span-2">
                                    <div className="flex flex-1 min-h-[240px] lg:min-h-0 items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="Scandio Report interface showing a fault diagnosis with cost estimate range and a Share Report button"
                                            aspectRatio="aspect-[4/3]"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Your Secure Scandio Report"
                                        description="A professional diagnosis document you own. Share it with contractors via a secure link or a WhatsApp summary — and use it to hold anyone you hire accountable."
                                    />
                                </BentoCell>

                                {/* Private by Default */}
                                <BentoCell>
                                    <div className="flex flex-1 min-h-[140px] items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="A lock icon indicating private and encrypted report storage"
                                            aspectRatio="aspect-video"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Private by Default"
                                        description="Your reports are private and secure. Only people you explicitly share a link with can view your diagnosis."
                                    />
                                </BentoCell>

                                {/* Cost Estimates */}
                                <BentoCell>
                                    <div className="flex flex-1 min-h-[140px] items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="Cost estimate range display showing R850 to R1 400"
                                            aspectRatio="aspect-video"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Instant Cost Estimates"
                                        description="Know the realistic price range before you make a single call. Stop overpaying and start negotiating from a position of knowledge."
                                    />
                                </BentoCell>

                                {/* Accurate Fault Diagnosis — 2 cols wide */}
                                <BentoCell className="lg:col-span-2">
                                    <div className="flex flex-1 min-h-[140px] items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="AI fault diagnosis screen listing root causes and recommended next steps"
                                            aspectRatio="aspect-[21/9]"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Accurate Fault Diagnosis"
                                        description="AI that identifies root causes, not just symptoms, so contractors can fix the problem properly the first time."
                                    />
                                </BentoCell>

                                {/* Compare Quotes — 2 cols */}
                                <BentoCell className="lg:col-span-2">
                                    <div className="flex flex-1 min-h-[140px] items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="Three contractor quote cards lined up for comparison, all based on the same Scandio Report"
                                            aspectRatio="aspect-video"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Compare Quotes Fairly"
                                        description="Send the same Scandio Report to multiple contractors. When everyone quotes on the same scope, comparison is straightforward and fair."
                                    />
                                </BentoCell>

                                {/* Vetted Contractors — 2 cols */}
                                <BentoCell className="lg:col-span-2">
                                    <div className="flex flex-1 min-h-[140px] items-center justify-center bg-secondary/60">
                                        <Placeholder
                                            label="Map of the Western Cape showing contractor location pins with star ratings"
                                            aspectRatio="aspect-video"
                                            className="h-full w-full"
                                        />
                                    </div>
                                    <BentoCellFooter
                                        title="Vetted Local Contractors"
                                        description="Our growing network spans the Western Cape. Browse by trade, location, and availability — and contact them directly."
                                    />
                                </BentoCell>
                            </motion.div>
                        </div>
                    </section>

                    {/* ── Social Proof / Momentum ───────────────────────────── */}
                    <section className="py-20 sm:py-28">
                        <motion.div
                            initial={{ opacity: 0, y: 22 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            viewport={{ once: true, margin: '-60px' }}
                            className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center space-y-6"
                        >
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Built for the Western Cape. Starting now.
                            </h2>
                            <div className="space-y-4 text-muted-foreground">
                                <p className="text-base leading-relaxed">
                                    Scandio is live across the Western Cape. Every diagnosis run
                                    makes the next one better. Every contractor who joins makes
                                    the network stronger.
                                </p>
                                <p className="text-base leading-relaxed">
                                    You are not joining a waitlist. You are using the product.
                                </p>
                            </div>
                            <StartDiagnosisButton>Generate Free Scandio Report</StartDiagnosisButton>
                        </motion.div>
                    </section>

                    {/* ── FAQ ───────────────────────────────────────────────── */}
                    <section id="faq" className="bg-muted/30 py-20 scroll-mt-16">
                        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                            <div className="mb-14 text-center">
                                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                    Frequently Asked Questions
                                </h2>
                            </div>

                            {/* Desktop: two-column — all visible, no accordion */}
                            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-x-20 lg:gap-y-10 max-w-5xl mx-auto">
                                {FAQS.map(({ q, a }) => (
                                    <Fragment key={q}>
                                        <div className="flex items-start">
                                            <h3 className="text-[17px] font-medium text-foreground leading-snug">
                                                {q}
                                            </h3>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                {a}
                                            </p>
                                        </div>
                                    </Fragment>
                                ))}
                            </div>

                            {/* Mobile: accordion */}
                            <div className="lg:hidden mx-auto max-w-3xl divide-y divide-border/50">
                                {FAQS.map(({ q, a }) => (
                                    <div key={q} className="py-4">
                                        <button
                                            onClick={() =>
                                                setOpenFaq(openFaq === q ? null : q)
                                            }
                                            className="flex w-full items-center justify-between gap-4 text-left"
                                        >
                                            <h3 className="text-base font-semibold text-foreground">
                                                {q}
                                            </h3>
                                            <ChevronDown
                                                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                                    openFaq === q ? 'rotate-180' : ''
                                                }`}
                                            />
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {openFaq === q && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{
                                                        duration: 0.25,
                                                        ease: 'easeInOut',
                                                    }}
                                                    className="overflow-hidden"
                                                >
                                                    <p className="mt-3 pb-2 text-sm text-muted-foreground leading-relaxed">
                                                        {a}
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* ── Final CTA — dark bookend ──────────────────────────── */}
                    <section className="bg-[#0D0D0D] py-24 sm:py-32">
                        <motion.div
                            initial={{ opacity: 0, y: 22 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            viewport={{ once: true, margin: '-60px' }}
                            className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center space-y-6"
                        >
                            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                                Your home has a problem. Find out what it is.
                            </h2>
                            <p className="text-base text-white/60">
                                Free. No account. Under 60 seconds.
                            </p>
                            <Button
                                asChild
                                size="lg"
                                className="bg-white text-black hover:bg-white/90 font-medium"
                            >
                                <Link href="/welcome">Generate Free Scandio Report</Link>
                            </Button>
                        </motion.div>
                    </section>
                </main>

                {/* ── Footer ────────────────────────────────────────────────── */}
                <footer className="border-t border-border/50 bg-background py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="flex flex-col gap-3">
                                <span className="text-sm font-semibold text-foreground">
                                    Scandio
                                </span>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Western Cape&apos;s home maintenance assistant. Diagnose faults
                                    instantly. Connect with trusted local contractors.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Product
                                </span>
                                <nav className="flex flex-col gap-2">
                                    {(
                                        [
                                            ['How It Works', '#how-it-works'],
                                            ['Features', '#features'],
                                            ['Generate Report', '/welcome'],
                                        ] as [string, string][]
                                    ).map(([label, href]) => (
                                        <Link
                                            key={`${label}-${href}`}
                                            href={href}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    For Contractors
                                </span>
                                <nav className="flex flex-col gap-2">
                                    {(
                                        [
                                            ['Join as a Pro', '/pro/join'],
                                            ['Pro Dashboard', '/pro'],
                                        ] as [string, string][]
                                    ).map(([label, href]) => (
                                        <Link
                                            key={`${label}-${href}`}
                                            href={href}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Legal
                                </span>
                                <nav className="flex flex-col gap-2">
                                    {(
                                        [
                                            ['Privacy Policy', '#'],
                                            ['Terms of Service', '#'],
                                        ] as [string, string][]
                                    ).map(([label, href]) => (
                                        <Link
                                            key={`${label}-${href}`}
                                            href={href}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                        </div>
                        <div className="mt-10 border-t border-border/50 pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                                &copy; {new Date().getFullYear()} Scandio. All rights reserved.
                                Western Cape, South Africa.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Built for homeowners, by people who&apos;ve been stuck on hold.
                            </p>
                        </div>
                    </div>
                </footer>
            </div>
        </MotionConfig>
    );
}
