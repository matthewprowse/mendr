import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { StartDiagnosisButton } from '@/app/page/_components/start-diagnosis-button';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
    title: 'Scandio: Home Maintenance Assistant',
    description:
        'Scandio diagnoses home maintenance faults instantly and connects you with trusted local contractors in the Western Cape. Get a free Scandio Report in seconds.',
    keywords: [
        'home maintenance',
        'home repair',
        'Western Cape',
        'contractors',
        'fault diagnosis',
        'Scandio',
    ],
    openGraph: {
        title: 'Scandio: Home Maintenance Assistant',
        description:
            'Diagnose home faults instantly. Get a professional Scandio Report. Connect with trusted local contractors.',
    },
};

// ─── Feature Bento Card ──────────────────────────────────────────────────────

function FeatureCard({
    label,
    aspectRatio = 'aspect-video',
    className = '',
    title = '',
    description = '',
}: {
    label: string;
    aspectRatio?: string;
    className?: string;
    title?: string;
    description?: string;
}) {
    const aspectClass =
        aspectRatio === 'aspect-[4/3]'
            ? 'lg:aspect-[4/3]'
            : aspectRatio === 'aspect-[21/9]'
              ? 'lg:aspect-[21/9]'
              : 'lg:aspect-video';

    return (
        <div
            className={`flex flex-col rounded-lg border border-border/50 bg-secondary/50 transition-all duration-250 hover:border-border/75 hover:bg-secondary/25 max-lg:aspect-auto max-lg:min-h-[300px] ${aspectClass} ${className}`}
        >
            <div className="flex flex-1 min-h-0 items-center justify-center">
                <span className="px-2 text-center text-sm text-muted-foreground">{label}</span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 rounded-b-lg border-t border-border/50 bg-white p-4">
                {title && <p className="text-sm font-medium text-foreground">{title}</p>}
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
    {
        name: 'Liesel van der Merwe',
        location: 'Cape Town',
        date: 'Feb 2026',
        review:
            'I had a mystery leak under my kitchen sink for weeks. Scandio identified it as a worn basin waste seal within seconds and gave me a cost estimate before I even called a plumber. Absolute lifesaver.',
    },
    {
        name: 'James Pietersen',
        location: 'Stellenbosch',
        date: 'Jan 2026',
        review:
            'The Scandio Report meant the electrician arrived knowing exactly what was wrong. No back-and-forth, no wasted call-out fee for "assessment." Fixed on the first visit.',
    },
    {
        name: 'Amahle Dlamini',
        location: 'Somerset West',
        date: 'Mar 2026',
        review:
            "As a first-time homeowner I had no idea what anything meant. Scandio explained everything in plain language and the report gave me confidence when speaking to contractors — they couldn't pull the wool over my eyes.",
    },
    {
        name: 'Deon Fouché',
        location: 'Paarl',
        date: 'Feb 2026',
        review:
            'I sent the Scandio Report via WhatsApp to three contractors and had quotes within an hour. Being able to compare quotes with the same clear scope of work was a game changer.',
    },
    {
        name: 'Taryn Hendricks',
        location: 'Cape Town',
        date: 'Jan 2026',
        review:
            'My geyser packed up on a Sunday morning. Scandio diagnosed a failed thermostat, estimated the repair cost, and helped me find an emergency plumber nearby. Stress-free from start to finish.',
    },
    {
        name: 'Werner Louw',
        location: 'Durbanville',
        date: 'Mar 2026',
        review:
            'I used to dread calling contractors because I never knew if I was being overcharged. Now I arrive with a Scandio Report and a ballpark figure — the dynamic has completely shifted.',
    },
];

function TestimonialCard({
    name,
    location,
    date,
    review,
}: {
    name: string;
    location: string;
    date: string;
    review: string;
}) {
    return (
        <div className="flex flex-col gap-4 rounded-md border border-border/50 bg-card hover:border-border/75 transition-all duration-250 p-4 shadow-none">
            <blockquote className="border-l-2 border-input pl-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{review}</p>
            </blockquote>
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">{location}</span>
                </div>
                <span className="text-xs text-muted-foreground">{date}</span>
            </div>
        </div>
    );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

const STATS = [
    { value: '< 60s', label: 'Average diagnosis time' },
    { value: '300+', label: 'Contractors in the Western Cape' },
    { value: '94%', label: 'First-visit resolution rate' },
    { value: '100%', label: 'Free Scandio Report' },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: 'Is the Scandio Report really free?',
        a: 'Yes. Generating a Scandio Report costs nothing. You only pay when a contractor you choose does the work — we never take a commission.',
    },
    {
        q: 'How accurate is the AI diagnosis?',
        a: "Scandio uses state-of-the-art vision AI trained on thousands of home maintenance faults. The diagnosis is a professional starting point, not a substitute for a qualified tradesperson's physical inspection.",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#features', label: 'Features' },
                    { href: '#testimonials', label: 'Testimonials' },
                    { href: '/pro', label: 'For Pros' },
                ]}
                logoHref="/landing"
                showTrades={false}
            />

            <main className="flex-1">
                {/* ── Hero ── */}
                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
                            <span className="text-base text-muted-foreground font-medium">
                                Sophisticated Systems, Simplified Solutions.
                            </span>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                                Western Cape&apos;s New Standard in Home Maintenance
                            </h1>
                            <p className="text-base text-muted-foreground max-w-lg">
                                Your home didn&apos;t come with a manual, and home maintenance
                                shouldn&apos;t be a guessing game. Scandio diagnoses faults
                                instantly and generates a secure, professional Scandio Report for
                                you to own and share with a contractor of your choice.
                            </p>
                            <p className="text-base text-muted-foreground max-w-lg">
                                Skip the uncertainty. Gain instant clarity on costs and connect
                                with local specialists to resolve repairs faster and more accurately.
                            </p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <StartDiagnosisButton className="text-sm">
                                    Generate Free Scandio Report
                                </StartDiagnosisButton>
                                <Button variant="ghost" size="default" asChild>
                                    <Link href="#how-it-works" className="text-sm">
                                        See how it works →
                                    </Link>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                No sign-up required &middot; 100% free report &middot; Western Cape
                            </p>
                        </div>

                        <div className="flex justify-center">
                            <div className="relative w-full max-w-[348px] overflow-hidden rounded-3xl border border-border/50 bg-secondary/50 hover:bg-secondary/25 transition-all duration-250">
                                <div className="aspect-[9/16] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                                    Scandio Report Mockup
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Stats bar ── */}
                <section className="border-y border-border/50 bg-muted/30 py-10">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
                            {STATS.map(({ value, label }) => (
                                <div key={label} className="flex flex-col items-center text-center gap-1">
                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                        {value}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Trusted contractors ── */}
                <section className="bg-muted/50 py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <p className="mb-8 text-center text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Trusted by leading Western Cape contractors
                        </p>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:grid-rows-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <div
                                    key={i}
                                    className="flex h-20 items-center justify-center rounded-lg border border-border/50 hover:border-border/75 transition-all duration-250 bg-white text-center text-xs text-muted-foreground"
                                >
                                    Contractor Logo
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── How It Works ── */}
                <section
                    id="how-it-works"
                    className="mx-auto max-w-7xl space-y-16 px-4 py-20 sm:px-6 lg:px-8 scroll-mt-16"
                >
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            How Scandio Works
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                            We&apos;ve transformed the search for home maintenance contractors into a
                            streamlined, professional process — from fault to fix in three steps.
                        </p>
                    </div>

                    {/* Step 1 */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div className="space-y-3 order-2 lg:order-1">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Step 1
                            </span>
                            <h3 className="text-xl font-semibold">Capture Your Fault</h3>
                            <p className="text-base text-muted-foreground">
                                Take a photo of your maintenance issue or describe it in plain
                                language. Scandio&apos;s AI identifies the fault type, analyses the
                                visible symptoms in real-time, and gives you an accurate, professional
                                starting point — no technical knowledge required.
                            </p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <Placeholder
                                label="Capture Fault Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div>
                            <Placeholder
                                label="Generate Scandio Report Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-3">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Step 2
                            </span>
                            <h3 className="text-xl font-semibold">
                                Receive Your Scandio Report
                            </h3>
                            <p className="text-base text-muted-foreground">
                                Within seconds you&apos;ll receive an expert-level home repair
                                analysis including a fault summary, likely root causes, and an
                                estimated cost range. Your free Scandio Report is securely stored and
                                ready to share — it&apos;s your asset to keep.
                            </p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div className="space-y-3 order-2 lg:order-1">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Step 3
                            </span>
                            <h3 className="text-xl font-semibold">
                                Connect with Local Contractors
                            </h3>
                            <p className="text-base text-muted-foreground">
                                Choose which local contractors receive your Scandio Report. Share via
                                a secure link or a WhatsApp-ready summary so they arrive informed,
                                prepared, and able to resolve the issue on the first visit. You stay
                                in control — we never take a commission.
                            </p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <Placeholder
                                label="Connect with Local Contractors Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                    </div>
                </section>

                {/* ── Features bento ── */}
                <section id="features" className="bg-muted/50 py-16 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Everything You Need, Nothing You Don&apos;t
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                Scandio gives you the information and tools professionals use,
                                without the jargon or the guesswork.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:grid-rows-3">
                            {/* Large hero card — 2 cols × 2 rows */}
                            <div className="min-h-[200px] lg:col-span-2 lg:row-span-2 lg:min-h-0">
                                <FeatureCard
                                    label="Scandio Report Mockup"
                                    aspectRatio="aspect-[4/3]"
                                    className="h-full min-h-[200px] w-full"
                                    title="Your Secure Scandio Report"
                                    description="A professional diagnosis document you own. Share it with contractors via a secure link or a WhatsApp summary — and use it to hold anyone you hire accountable."
                                />
                            </div>

                            {/* Top-right pair */}
                            <div className="min-h-[180px] lg:min-h-0">
                                <FeatureCard
                                    label="Data Privacy UI"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Private by Default"
                                    description="Your reports are private and secure. Only people you explicitly share a link with can view your diagnosis."
                                />
                            </div>
                            <div className="min-h-[180px] lg:min-h-0">
                                <FeatureCard
                                    label="Cost Estimate UI"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Instant Cost Estimates"
                                    description="Know the realistic price range before you make a single call. Stop overpaying and start negotiating from a position of knowledge."
                                />
                            </div>

                            {/* Wide card — 2 cols */}
                            <div className="min-h-[160px] lg:col-span-2 lg:min-h-0">
                                <FeatureCard
                                    label="Fault Diagnosis UI"
                                    aspectRatio="aspect-[21/9]"
                                    className="h-full min-h-[160px] w-full"
                                    title="Accurate Fault Diagnosis"
                                    description="AI trained on thousands of real home maintenance faults identifies root causes, not just symptoms, so contractors can fix the problem properly the first time."
                                />
                            </div>

                            {/* Bottom row — 2 × 2-col cards */}
                            <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                                <FeatureCard
                                    label="Share Report UI"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Compare Quotes Fairly"
                                    description="Send the same Scandio Report to multiple contractors. When everyone quotes on the same scope, comparison is straightforward and fair."
                                />
                            </div>
                            <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                                <FeatureCard
                                    label="Local Specialists UI"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Vetted Local Contractors"
                                    description="Our network covers 300+ contractors across the Western Cape. Browse by trade, location, and availability — and contact them directly."
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Mid-page CTA ── */}
                <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        Stop guessing. Start knowing.
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                        Join thousands of Western Cape homeowners who diagnose first and pay fair.
                        Your first Scandio Report is free — no account needed.
                    </p>
                    <div className="mt-8">
                        <StartDiagnosisButton>Generate Free Scandio Report</StartDiagnosisButton>
                    </div>
                </section>

                {/* ── Testimonials ── */}
                <section
                    id="testimonials"
                    className="bg-secondary/50 py-16 sm:py-28 scroll-mt-16"
                >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Homeowners Love Scandio
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                Real stories from Western Cape homeowners who stopped guessing and
                                started resolving.
                            </p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {TESTIMONIALS.map(({ name, location, date, review }, i) => (
                                <TestimonialCard
                                    key={i}
                                    name={name}
                                    location={location}
                                    date={date}
                                    review={review}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── FAQ ── */}
                <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
                    <div className="mb-12 text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Frequently Asked Questions
                        </h2>
                    </div>
                    <div className="mx-auto max-w-3xl divide-y divide-border/50">
                        {FAQS.map(({ q, a }) => (
                            <div key={q} className="py-6">
                                <h3 className="text-base font-semibold text-foreground">{q}</h3>
                                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                                    {a}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className="bg-foreground py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-2xl font-bold tracking-tight text-background sm:text-3xl">
                            Ready to take the guesswork out of home maintenance?
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-background/70 text-base">
                            Generate your free Scandio Report in under 60 seconds. No account, no
                            commitment — just clarity.
                        </p>
                        <div className="mt-8">
                            <Button
                                asChild
                                variant="secondary"
                                size="lg"
                                className="text-sm font-medium"
                            >
                                <Link href="/welcome">Generate Free Scandio Report</Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            {/* ── Footer ── */}
            <footer className="border-t border-border/50 bg-background py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="flex flex-col gap-3">
                            <span className="text-sm font-semibold text-foreground">Scandio</span>
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
                                {[
                                    ['How It Works', '#how-it-works'],
                                    ['Features', '#features'],
                                    ['Generate Report', '/welcome'],
                                ].map(([label, href]) => (
                                    <Link
                                        key={href}
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
                                {[
                                    ['Join as a Pro', '/pro'],
                                    ['Pro Dashboard', '/pro'],
                                ].map(([label, href]) => (
                                    <Link
                                        key={href}
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
                                {[
                                    ['Privacy Policy', '#'],
                                    ['Terms of Service', '#'],
                                ].map(([label, href]) => (
                                    <Link
                                        key={href}
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
                            &copy; {new Date().getFullYear()} Scandio. All rights reserved. Western Cape, South Africa.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Built for homeowners, by people who&apos;ve been stuck on hold.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
