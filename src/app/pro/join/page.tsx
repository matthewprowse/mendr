'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// ─── Static data ──────────────────────────────────────────────────────────────

const STATS = [
    { value: '300+', label: 'Active contractors on the network' },
    { value: '94%', label: 'First-visit resolution rate' },
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

const TESTIMONIALS = [
    {
        name: 'Riaan Botha',
        trade: 'Plumber',
        location: 'Cape Town',
        review:
            'Before Scandio, I spent half my day on assessment call-outs that went nowhere. Now the report comes through before I arrive and I can quote accurately in five minutes. My turnaround is better and my customers are happier.',
    },
    {
        name: 'Chanel Abrahams',
        trade: 'Electrician',
        location: 'Bellville',
        review:
            "The quality of enquiries is completely different. Homeowners know what they want, they've already understood the problem, and they're ready to proceed. My conversion rate has gone through the roof.",
    },
    {
        name: 'Pieter Engelbrecht',
        trade: 'Roofer',
        location: 'Stellenbosch',
        review:
            "I was sceptical at first — I've tried three other platforms and they all took commission. Scandio takes nothing. The profile setup was simple and within a week I had three real enquiries from my area.",
    },
];

const TRADES = [
    'Plumbing',
    'Electrical',
    'Roofing',
    'Painting',
    'Tiling',
    'Carpentry & Joinery',
    'Air Conditioning & HVAC',
    'Appliance Repair',
    'Waterproofing',
    'Landscaping & Garden',
    'Security Systems',
    'General Maintenance',
    'Other',
];

const AREAS = [
    'Cape Town (City Bowl)',
    'Atlantic Seaboard',
    'Southern Suburbs',
    'Northern Suburbs',
    'Bellville & Tygerberg',
    'Stellenbosch',
    'Paarl & Wellington',
    'Somerset West & Strand',
    'Hermanus',
    'Other Western Cape',
];

// ─── How It Works (for pros) ──────────────────────────────────────────────────

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
            'Once accepted, you\'ll get access to your contractor profile. Add your credentials, past work photos, operating hours, and service areas. Your profile is your digital shopfront.',
    },
    {
        step: '03',
        title: 'Receive Informed Enquiries',
        description:
            'Homeowners in your area discover you through Scandio and share their report when they contact you. You arrive knowing the fault, the history, and what to bring.',
    },
];

// ─── Form ────────────────────────────────────────────────────────────────────

type FormState = 'idle' | 'submitting' | 'success' | 'error';

function JoinForm() {
    const [formState, setFormState] = useState<FormState>('idle');
    const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
    const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

    function toggleTrade(trade: string) {
        setSelectedTrades((prev) =>
            prev.includes(trade) ? prev.filter((t) => t !== trade) : [...prev, trade],
        );
    }

    function toggleArea(area: string) {
        setSelectedAreas((prev) =>
            prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
        );
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setFormState('submitting');

        // Simulate submission — wire up to your API / Supabase table here
        await new Promise((resolve) => setTimeout(resolve, 1200));
        setFormState('success');
    }

    if (formState === 'success') {
        return (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
                    <svg
                        className="h-8 w-8 text-background"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-foreground">Application Received</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                    Thank you for applying to join the Scandio contractor network. Our team will
                    review your application and be in touch within 2 business days.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* Personal / Business details */}
            <div className="flex flex-col gap-5">
                <h3 className="text-base font-semibold text-foreground">Business Details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="businessName">Business name</Label>
                        <Input
                            id="businessName"
                            name="businessName"
                            placeholder="e.g. Botha Plumbing"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="contactName">Contact person</Label>
                        <Input
                            id="contactName"
                            name="contactName"
                            placeholder="Full name"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email">Email address</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phone">Phone number</Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="+27 82 000 0000"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="website">
                            Website{' '}
                            <span className="text-xs text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="website"
                            name="website"
                            type="url"
                            placeholder="https://yourwebsite.co.za"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="yearsExperience">Years in business</Label>
                        <Input
                            id="yearsExperience"
                            name="yearsExperience"
                            type="number"
                            min="0"
                            max="100"
                            placeholder="e.g. 8"
                            required
                        />
                    </div>
                </div>
            </div>

            {/* Trades */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                    <Label>Trades offered</Label>
                    <p className="text-xs text-muted-foreground">Select all that apply.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {TRADES.map((trade) => {
                        const active = selectedTrades.includes(trade);
                        return (
                            <button
                                key={trade}
                                type="button"
                                onClick={() => toggleTrade(trade)}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                                    active
                                        ? 'border-foreground bg-foreground text-background'
                                        : 'border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                                }`}
                            >
                                {trade}
                            </button>
                        );
                    })}
                </div>
                {/* Hidden inputs to submit selected trades */}
                {selectedTrades.map((t) => (
                    <input key={t} type="hidden" name="trades" value={t} />
                ))}
            </div>

            {/* Service areas */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                    <Label>Areas served</Label>
                    <p className="text-xs text-muted-foreground">
                        Select all areas you actively service.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {AREAS.map((area) => {
                        const active = selectedAreas.includes(area);
                        return (
                            <button
                                key={area}
                                type="button"
                                onClick={() => toggleArea(area)}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                                    active
                                        ? 'border-foreground bg-foreground text-background'
                                        : 'border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                                }`}
                            >
                                {area}
                            </button>
                        );
                    })}
                </div>
                {selectedAreas.map((a) => (
                    <input key={a} type="hidden" name="areas" value={a} />
                ))}
            </div>

            {/* Qualifications & capacity */}
            <div className="flex flex-col gap-5">
                <h3 className="text-base font-semibold text-foreground">
                    Qualifications &amp; Capacity
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="registrationNumber">
                            Registration / licence number{' '}
                            <span className="text-xs text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="registrationNumber"
                            name="registrationNumber"
                            placeholder="e.g. NHBRC 12345 / COC number"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="teamSize">Team size</Label>
                        <Input
                            id="teamSize"
                            name="teamSize"
                            type="number"
                            min="1"
                            placeholder="Number of people, incl. yourself"
                            required
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="about">
                        Tell us about your business{' '}
                        <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                        id="about"
                        name="about"
                        placeholder="What sets you apart? Any specialisations, certifications, or types of work you're known for?"
                        rows={4}
                        className="resize-none"
                    />
                </div>
            </div>

            {/* Referral */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="referral">
                    How did you hear about Scandio?{' '}
                    <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                    id="referral"
                    name="referral"
                    placeholder="e.g. Word of mouth, Google, Instagram…"
                />
            </div>

            {/* Submit */}
            <div className="flex flex-col gap-3 pt-2">
                <Button
                    type="submit"
                    size="lg"
                    disabled={formState === 'submitting' || selectedTrades.length === 0}
                    className="w-full sm:w-fit"
                >
                    {formState === 'submitting' ? 'Submitting…' : 'Apply to Join the Network'}
                </Button>
                {selectedTrades.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        Please select at least one trade to continue.
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    By submitting you agree to our{' '}
                    <Link href="#" className="underline underline-offset-2 hover:text-foreground">
                        Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="#" className="underline underline-offset-2 hover:text-foreground">
                        Privacy Policy
                    </Link>
                    .
                </p>
            </div>
        </form>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProJoinPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#benefits', label: 'Benefits' },
                    { href: '#testimonials', label: 'From the Network' },
                    { href: '#join', label: 'Apply Now' },
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
                                Join the Western Cape&apos;s fastest-growing contractor network.
                                Zero commission, ever.
                            </p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <Button asChild size="default">
                                    <Link href="#join" className="text-sm">
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
                            <div className="relative w-full max-w-[348px] overflow-hidden rounded-3xl border border-border/50 bg-secondary/50 hover:bg-secondary/25 transition-all duration-250">
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
                        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
                            {STATS.map(({ value, label }) => (
                                <div
                                    key={label}
                                    className="flex flex-col items-center text-center gap-1"
                                >
                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                        {value}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── How it works (pro perspective) ── */}
                <section
                    id="how-it-works"
                    className="mx-auto max-w-7xl space-y-16 px-4 py-20 sm:px-6 lg:px-8 scroll-mt-16"
                >
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            How Scandio Works for Contractors
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                            From application to first informed enquiry — here&apos;s what
                            joining the Scandio network looks like.
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
                                    <span className="text-3xl font-bold text-muted-foreground/20 leading-none">
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

                {/* ── Benefits bento ── */}
                <section id="benefits" className="bg-muted/50 py-16 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Built for Contractors Who Value Their Time
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                Every feature in Scandio is designed to reduce wasted effort and put
                                more jobs in your diary.
                            </p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {BENEFITS.map(({ title, description }) => (
                                <div
                                    key={title}
                                    className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background p-6 transition-all duration-250 hover:border-border/75"
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

                {/* ── Testimonials from pros ── */}
                <section id="testimonials" className="py-16 sm:py-24 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                From the Network
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                                Contractors who joined early and what changed for their business.
                            </p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {TESTIMONIALS.map(({ name, trade, location, review }, i) => (
                                <div
                                    key={i}
                                    className="flex flex-col gap-4 rounded-md border border-border/50 bg-card hover:border-border/75 transition-all duration-250 p-4"
                                >
                                    <blockquote className="border-l-2 border-input pl-3">
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {review}
                                        </p>
                                    </blockquote>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {trade} &middot; {location}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Join form ── */}
                <section id="join" className="bg-muted/30 py-16 sm:py-24 scroll-mt-16">
                    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-10 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Apply to Join the Network
                            </h2>
                            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                                Applications are reviewed within 2 business days. We maintain a
                                high-quality network — every contractor is vetted before being
                                listed.
                            </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-background p-6 sm:p-8">
                            <JoinForm />
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className="bg-foreground py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-2xl font-bold tracking-tight text-background sm:text-3xl">
                            Ready to work smarter?
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-background/70 text-base">
                            Join 300+ Western Cape contractors who arrive informed, quote
                            accurately, and finish jobs on the first visit.
                        </p>
                        <div className="mt-8">
                            <Button asChild variant="secondary" size="lg">
                                <Link href="#join">Apply to Join — It&apos;s Free</Link>
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
                                Western Cape&apos;s home maintenance assistant. Connecting informed
                                homeowners with trusted local contractors.
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
                                    ['Apply Now', '#join'],
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
