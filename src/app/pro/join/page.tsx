'use client';

import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';

// ─── Static data ──────────────────────────────────────────────────────────────

const STATS = [
    { value: 'Founding network', label: 'Western Cape' },
    { value: '< 60s', label: 'Average report delivery time' },
    { value: '0%', label: 'Commission taken by Scandio' },
];

const BENEFITS = [
    {
        title: 'Arrive Informed, Not Guessing',
        description:
            'Homeowners share their Scandio Report before you arrive. You know the fault, the symptoms, and the scope before you leave the yard — reducing wasted call-outs and improving first-visit fix rates.',
    },
    {
        title: 'Qualified Leads, Not Tyre-Kickers',
        description:
            'Every homeowner who contacts you through Scandio has already diagnosed their problem and committed to resolving it. No cold enquiries, no price shoppers, no time wasted.',
    },
    {
        title: 'Your Profile, Your Reputation',
        description:
            'Build a verified Scandio profile with reviews, past work gallery, and trade credentials. Let your work speak for itself and stand out from the crowd.',
    },
    {
        title: 'Zero Commission, Always',
        description:
            "We don't take a cut of your jobs. You quote, you invoice, you get paid — the full amount. Scandio charges homeowners nothing and contractors nothing. We grow when you grow.",
    },
    {
        title: 'Be Discovered in Your Area',
        description:
            'Homeowners search by trade and location. Your profile appears when someone nearby needs your skills, driving local enquiries to you without any advertising spend on your part.',
    },
    {
        title: 'Transparent Reviews You Can Trust',
        description:
            'Scandio reviews are tied to real jobs and use a structured rating system — punctuality, cleanliness, work quality, and quote accuracy. Earn honest trust signals that actually differentiate you.',
    },
];

const WHAT_TO_EXPECT = [
    'Pre-diagnosed leads — homeowners share their Scandio Report before contacting you, so you know the fault before you arrive.',
    'No commission, ever — we charge contractors a flat monthly subscription once out of beta, never a cut of your jobs.',
    'Equal visibility in the founding phase — all founding members appear in search results while we build lead volume across the Western Cape.',
];

const HOW_IT_WORKS = [
    {
        step: '01',
        title: 'Apply to Join the Network',
        description:
            'Fill in the application below with your trade, service area, and contact details. Our team reviews every application to maintain the quality of the network.',
    },
    {
        step: '02',
        title: 'Set Up Your Scandio Profile',
        description:
            "Once accepted, you'll get access to your contractor profile. Add your credentials, past work photos, operating hours, and service areas. Your profile is your digital shopfront.",
    },
    {
        step: '03',
        title: 'Receive Informed Enquiries',
        description:
            'Homeowners in your area discover you through Scandio and share their report when they contact you. You arrive knowing the fault, the history, and what to bring.',
    },
];

type PricingFeature = { text: string; sub?: string };
type PricingTier = {
    name: string;
    timing: string;
    price: string;
    priceNote: string;
    highlight: boolean;
    features: PricingFeature[];
    lockInNote?: string;
    cta?: { label: string; href: string };
    secondaryLink?: { label: string; href: string };
};

const PRICING_TIERS: PricingTier[] = [
    {
        name: 'Founding Member',
        timing: 'Now — Beta',
        price: 'Free',
        priceNote: 'No credit card required',
        highlight: true,
        lockInNote: 'Founding members lock in at R249/mo — guaranteed.',
        cta: { label: 'Get Started Free', href: '/pro/onboard' },
        features: [
            { text: 'Full profile listing' },
            { text: 'Appears in search results' },
            { text: 'Receive Scandio Reports' },
            { text: 'Review collection' },
            { text: 'Work gallery' },
            { text: 'Priority placement at launch' },
        ],
    },
    {
        name: 'Solo',
        timing: 'Est. late 2026',
        price: 'R249/mo',
        priceNote: 'For individual contractors',
        highlight: false,
        secondaryLink: { label: 'Join founding network now →', href: '/pro/onboard' },
        features: [
            { text: 'Standard profile — name, trade, rating, contact' },
            { text: 'Appears in search results' },
            { text: 'Receive Scandio Reports' },
            { text: 'Review collection' },
        ],
    },
    {
        name: 'Basic Team',
        timing: 'Est. late 2026',
        price: 'R649/mo',
        priceNote: 'For teams of 3 to 5',
        highlight: false,
        secondaryLink: { label: 'Join founding network now →', href: '/pro/onboard' },
        features: [
            { text: 'Everything in Solo' },
            { text: 'Up to 5 team member profiles' },
            { text: 'Priority placement in match results', sub: 'First in results for diagnoses matching your trade and area.' },
            { text: 'Advanced analytics — profile views and lead data' },
            { text: 'Direct WhatsApp contact from profile' },
        ],
    },
    {
        name: 'Enterprise',
        timing: 'Est. late 2026',
        price: 'R1,249/mo',
        priceNote: 'For large operations and franchises',
        highlight: false,
        secondaryLink: { label: 'Join founding network now →', href: '/pro/onboard' },
        features: [
            { text: 'Everything in Basic Team' },
            { text: 'Unlimited team seats' },
            { text: 'White label Scandio Reports with your branding', sub: 'Your logo and colours alongside Scandio on every report you receive.' },
            { text: 'Highest priority placement in all results' },
            { text: 'Dedicated account support' },
        ],
    },
];

export default function ProJoinPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#benefits', label: 'Benefits' },
                    { href: '#pricing', label: 'Pricing' },
                    { href: '#testimonials', label: 'From the Network' },
                    { href: '/landing', label: 'For Homeowners' },
                ]}
                logoHref="/pro/join"
                showTrades={false}
            />

            <main className="flex-1">
                {/* ── Hero ── */}
                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
                            <span className="inline-flex items-center rounded-full border border-border/50 bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                                For Western Cape Contractors
                            </span>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                                Less time quoting. More time fixing.
                            </h1>
                            <p className="text-base text-muted-foreground max-w-lg">
                                Scandio sends you homeowners who already know their problem. No
                                cold enquiries, no wasted assessment visits — just qualified leads
                                with a professional fault report in hand before you arrive.
                            </p>
                            <p className="text-base text-muted-foreground max-w-lg">
                                Join the Western Cape&apos;s founding contractor network.
                                Zero commission, ever.
                            </p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <Button asChild size="default">
                                    <Link href="/pro/onboard" className="text-sm">
                                        Apply to Join the Network
                                    </Link>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <Link href="#how-it-works" className="text-sm">
                                        See how it works →
                                    </Link>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Free to join &middot; No commission &middot; Western Cape only
                            </p>
                        </div>

                        <div className="flex justify-center">
                            <div className="relative w-full max-w-[348px] overflow-hidden rounded-3xl border border-border/50 bg-secondary/50">
                                <div className="aspect-[9/16] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                                    Contractor Profile Mockup
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Stats ── */}
                <section className="border-y border-border/50 bg-muted/30 py-10">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                            {STATS.map(({ value, label }) => (
                                <div
                                    key={label}
                                    className="flex flex-col items-center text-center gap-1"
                                >
                                    <span className="text-2xl font-bold tracking-tight text-foreground">
                                        {value}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── How it works ── */}
                <section
                    id="how-it-works"
                    className="mx-auto max-w-7xl space-y-16 px-4 py-20 sm:px-6 lg:px-8 scroll-mt-16"
                >
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            How Scandio Works for Contractors
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                            From application to first informed enquiry — here&apos;s what joining
                            the Scandio network looks like.
                        </p>
                    </div>

                    {HOW_IT_WORKS.map(({ step, title, description }, i) => {
                        const isEven = i % 2 === 1;
                        return (
                            <div
                                key={step}
                                className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12"
                            >
                                <div
                                    className={`space-y-3 ${isEven ? 'order-2 lg:order-2' : 'order-2 lg:order-1'}`}
                                >
                                    <span className="text-4xl font-bold text-muted-foreground/15 leading-none select-none">
                                        {step}
                                    </span>
                                    <h3 className="text-xl font-semibold">{title}</h3>
                                    <p className="text-base text-muted-foreground">{description}</p>
                                </div>
                                <div
                                    className={`order-1 ${isEven ? 'lg:order-1' : 'lg:order-2'}`}
                                >
                                    <Placeholder
                                        label={`${title} Mockup`}
                                        aspectRatio="aspect-[4/3]"
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </section>

                {/* ── Benefits ── */}
                <section id="benefits" className="bg-muted/50 py-16 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Built for Contractors Who Value Their Time
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                Every feature in Scandio is designed to reduce wasted effort and
                                put more jobs in your diary.
                            </p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {BENEFITS.map(({ title, description }) => (
                                <div
                                    key={title}
                                    className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background p-6 transition-all duration-200 hover:border-border/75"
                                >
                                    <h3 className="text-sm font-semibold text-foreground">
                                        {title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Pricing ── */}
                <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 scroll-mt-16">
                    <div className="mb-10 text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Simple pricing. No surprises.
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                            Free during our founding phase — no credit card, no commitment, no catch.
                        </p>
                        <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
                            Paid tiers launch late 2026. Every founding member will be notified and locked in at the best available rate before anything changes.
                        </p>
                        <p className="mx-auto mt-3 max-w-xl text-xs text-muted-foreground/70">
                            Pricing shown is indicative only and subject to change. All members notified at least 30 days before any changes.
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {PRICING_TIERS.map(({ name, timing, price, priceNote, highlight, features, lockInNote, cta, secondaryLink }) => (
                            <div
                                key={name}
                                className={`relative flex flex-col gap-5 rounded-xl border p-6 transition-all duration-200 ${
                                    highlight
                                        ? 'border-foreground bg-foreground text-background'
                                        : 'border-border/50 bg-background hover:border-border/75'
                                }`}
                            >
                                {highlight && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-foreground bg-background px-3 py-0.5 text-xs font-semibold text-foreground">
                                        Join Now
                                    </span>
                                )}
                                <div className="flex flex-col gap-1">
                                    <p className={`text-xs font-medium uppercase tracking-wider ${highlight ? 'text-background/60' : 'text-muted-foreground'}`}>
                                        {timing}
                                    </p>
                                    <h3 className={`text-base font-semibold ${highlight ? 'text-background' : 'text-foreground'}`}>
                                        {name}
                                    </h3>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className={`text-3xl font-bold tracking-tight ${highlight ? 'text-background' : 'text-foreground'}`}>
                                        {price}
                                    </span>
                                    <span className={`text-xs ${highlight ? 'text-background/60' : 'text-muted-foreground'}`}>
                                        {priceNote}
                                    </span>
                                </div>
                                <ul className="flex flex-col gap-2 flex-1">
                                    {features.map((f) => (
                                        <li key={f.text} className="flex items-start gap-2">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className={`mt-0.5 shrink-0 ${highlight ? 'text-background/70' : 'text-muted-foreground'}`}
                                            >
                                                <path d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="flex flex-col gap-0.5">
                                                <span className={`text-sm ${highlight ? 'text-background/80' : 'text-muted-foreground'}`}>
                                                    {f.text}
                                                </span>
                                                {f.sub && (
                                                    <span className={`text-xs leading-relaxed ${highlight ? 'text-background/50' : 'text-muted-foreground/60'}`}>
                                                        {f.sub}
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {cta && (
                                    <div className="mt-auto flex flex-col gap-1.5">
                                        <Button asChild variant="secondary" className="w-full">
                                            <Link href={cta.href}>{cta.label}</Link>
                                        </Button>
                                        {lockInNote && (
                                            <p className={`text-center text-xs ${highlight ? 'text-background/50' : 'text-muted-foreground/70'}`}>
                                                {lockInNote}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {secondaryLink && (
                                    <div className="mt-auto pt-2 text-center">
                                        <Link
                                            href={secondaryLink.href}
                                            className="text-xs text-muted-foreground hover:underline"
                                        >
                                            {secondaryLink.label}
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="mt-8 text-center text-xs text-muted-foreground/70">
                        All members notified at least 30 days before any pricing changes. No surprises, ever.
                    </p>
                </section>

                {/* ── What to expect ── */}
                <section id="testimonials" className="bg-secondary/50 py-16 sm:py-24 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                What to expect when you join.
                            </h2>
                        </div>
                        <div className="mx-auto max-w-2xl space-y-6">
                            {WHAT_TO_EXPECT.map((point, i) => (
                                <div key={i} className="flex gap-4">
                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                                    <p className="text-base text-muted-foreground leading-relaxed">{point}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className="bg-foreground py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-2xl font-bold tracking-tight text-background sm:text-3xl">
                            Join the founding contractor network.
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-background/70 text-base">
                            We are accepting applications from Western Cape contractors now.
                            Founding members lock in the best rate and get priority placement
                            when paid tiers launch in late 2026.
                        </p>
                        <div className="mt-8">
                            <Button asChild variant="secondary" size="lg">
                                <Link href="/pro/onboard">Apply to Join — It&apos;s Free</Link>
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
                                Western Cape&apos;s home maintenance assistant. Connecting
                                informed homeowners with trusted local contractors.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                For Contractors
                            </span>
                            <nav className="flex flex-col gap-2">
                                {[
                                    ['How It Works', '#how-it-works'],
                                    ['Benefits', '#benefits'],
                                    ['Pricing', '#pricing'],
                                    ['Apply Now', '/pro/onboard'],
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
                                For Homeowners
                            </span>
                            <nav className="flex flex-col gap-2">
                                {[
                                    ['How It Works', '/landing#how-it-works'],
                                    ['Generate Report', '/welcome'],
                                    ['Find Contractors', '/landing'],
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
                                Company
                            </span>
                            <nav className="flex flex-col gap-2">
                                {[
                                    ['Contact', '/contact'],
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
                            &copy; {new Date().getFullYear()} Scandio. All rights reserved.
                            Western Cape, South Africa.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            We take 0% commission. We mean it.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
