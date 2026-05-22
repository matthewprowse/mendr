import Link from 'next/link';
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Lead Quality ──────────────────────────────────────────────────────── */

export function Land2LeadQuality() {
    return (
        <section id="lead-quality" className="scroll-mt-20 bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">What makes Mendr different</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        A lead that tells you what you&apos;re getting into.
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#2F3E4E]/70">
                        On most platforms, a lead is a name and a phone number. You call blind, you quote blind, you lose
                        half to competitors who quoted lower without doing the work properly. Mendr leads come with a
                        diagnosis — the homeowner already knows what the problem is.
                    </p>
                </div>

                {/* Comparison */}
                <div className="mt-12 grid gap-4 sm:grid-cols-2">
                    {/* Typical lead */}
                    <div className="rounded-2xl border border-[#E8E4DD] bg-white p-6">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#2F3E4E]/40">
                            Typical platform lead
                        </p>
                        <div className="mt-4 space-y-3">
                            {[
                                '"Hi, I need a plumber"',
                                'No fault description',
                                'No urgency information',
                                'No budget expectation',
                                'Location: Claremont',
                            ].map((item) => (
                                <div key={item} className="flex items-start gap-2.5">
                                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={1.5} />
                                    <span className="text-sm text-[#2F3E4E]/60">{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Mendr lead */}
                    <div className="rounded-2xl border-2 border-[#C45C3A] bg-white p-6">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#C45C3A]">
                            Mendr lead
                        </p>
                        <div className="mt-4 space-y-3">
                            {[
                                'Geyser pressure valve failure, likely thermostat',
                                'Urgency: High — no hot water, 48hr',
                                'Budget expectation: R800–R1,600',
                                'Location: 3 Vineyard Rd, Claremont',
                                'Photo + written diagnosis attached',
                            ].map((item) => (
                                <div key={item} className="flex items-start gap-2.5">
                                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]" strokeWidth={1.5} />
                                    <span className="text-sm font-medium text-[#1C2B3A]">{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <p className="mt-8 text-center text-sm text-[#2F3E4E]/50">
                    That means no unrealistic expectations. No scope creep. Just a qualified job, with context, from
                    someone who&apos;s already decided to fix it.
                </p>
            </div>
        </section>
    );
}

/* ─── Zero Commission ───────────────────────────────────────────────────── */

export function Land2ZeroCommission() {
    return (
        <section className="bg-[#1C2B3A] py-20 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
                <p className="text-sm font-medium uppercase tracking-widest text-[#6B8F71]">Our business model</p>
                <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-white sm:text-4xl">
                    Zero commission. That&apos;s not a promotion. That&apos;s the model.
                </h2>
                <p className="mt-6 text-base leading-relaxed text-white/60">
                    Mendr charges contractors a monthly subscription. That&apos;s it. When a homeowner hires you through Mendr:
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    {[
                        { label: 'You quote', detail: 'Whatever the job requires — no restrictions.' },
                        { label: 'You get paid', detail: 'The full amount. Every rand.' },
                        { label: 'Mendr gets', detail: 'Nothing from that transaction. Ever.' },
                    ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white/5 p-5 text-left">
                            <p className="text-base font-semibold text-white">{item.label}</p>
                            <p className="mt-1 text-sm text-white/50">{item.detail}</p>
                        </div>
                    ))}
                </div>
                <p className="mt-8 text-sm text-white/40">
                    We make money when your subscription earns its keep. If you&apos;re not getting leads that convert, you
                    cancel and we lose. That&apos;s the alignment we want.
                </p>
            </div>
        </section>
    );
}

/* ─── How It Works ──────────────────────────────────────────────────────── */

const CONTRACTOR_STEPS = [
    {
        num: '01',
        title: 'Apply and get verified',
        body: "Submit your trade details, registration, and insurance documents. We verify manually within 48 hours. If you don't qualify, we'll tell you exactly why.",
    },
    {
        num: '02',
        title: 'Receive leads in your area',
        body: 'Set your service area, trade type, and capacity. Leads arrive with the full diagnosis attached. You choose which to pursue — no obligation, no bidding.',
    },
    {
        num: '03',
        title: 'Quote and win the job',
        body: 'Contact the homeowner directly. Send a structured quote. Close the job. Get paid the full amount. You keep your own client relationship — Mendr is a lead source, not a middleman.',
    },
] as const;

export function Land2HowItWorks() {
    return (
        <section id="how-it-works" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">How it works</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Simple. Practical. Yours.
                    </h2>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                    {CONTRACTOR_STEPS.map((step) => (
                        <div
                            key={step.num}
                            className="rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                        >
                            <span className="text-4xl font-bold text-[#E8E4DD]">{step.num}</span>
                            <h3 className="mt-4 text-lg font-semibold text-[#1C2B3A]">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#2F3E4E]/70">{step.body}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-8 rounded-xl border border-[#E8E4DD] bg-[#F4EFE6] p-4 text-center">
                    <p className="text-sm text-[#2F3E4E]/70">
                        <strong className="text-[#1C2B3A]">You keep your own client relationship.</strong>{' '}
                        Mendr doesn&apos;t sit between you and the homeowner once the job is confirmed.
                    </p>
                </div>
            </div>
        </section>
    );
}

/* ─── Contractor Testimonials ───────────────────────────────────────────── */

const CONTRACTOR_TESTIMONIALS = [
    {
        initials: 'RM',
        name: 'Reza M.',
        trade: 'Electrical Contractor',
        area: 'Cape Town Metro',
        quote: "I was on Kandua for two years. Five competitors quoting the same job, homeowners with no idea what they needed. I've been on Mendr for three months. The leads are fewer but every one has been genuine. I've converted four out of five.",
    },
    {
        initials: 'SO',
        name: 'Stefan O.',
        trade: 'Waterproofing Specialist',
        area: 'Winelands',
        quote: "The diagnosis report thing is actually clever. I arrived at my first Mendr job and the homeowner already knew it was penetrating damp, not rising. It took thirty seconds to confirm and we could talk about the repair instead of me explaining what damp is.",
    },
    {
        initials: 'ML',
        name: 'Monde L.',
        trade: 'General Building',
        area: 'Northern Suburbs',
        quote: "R249 for founding member access. That's one hour of work. I got two jobs in the first month. I don't think I need to do the maths.",
    },
] as const;

export function Land2Testimonials() {
    return (
        <section className="bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">What contractors say</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        From contractors already in the network.
                    </h2>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                    {CONTRACTOR_TESTIMONIALS.map((t) => (
                        <div
                            key={t.name}
                            className="flex flex-col rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1C2B3A] text-sm font-semibold text-white">
                                    {t.initials}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#1C2B3A]">{t.name}</p>
                                    <p className="text-xs text-[#2F3E4E]/50">{t.trade} · {t.area}</p>
                                </div>
                            </div>
                            <p className="mt-4 flex-1 text-sm leading-relaxed text-[#2F3E4E]/70">
                                &ldquo;{t.quote}&rdquo;
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─── Application CTA ───────────────────────────────────────────────────── */

export function Land2ApplicationCta() {
    return (
        <section id="apply" className="scroll-mt-20 bg-[#C45C3A] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-2">
                    {/* Copy */}
                    <div>
                        <p className="text-sm font-medium uppercase tracking-widest text-white/60">Founding cohort</p>
                        <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-white sm:text-4xl">
                            Join the founding network.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-white/75">
                            We&apos;re accepting applications for the founding contractor cohort in the Western Cape. Founding
                            members lock in their pricing for the lifetime of their subscription — regardless of what
                            standard pricing becomes.
                        </p>
                        <p className="mt-3 text-sm text-white/60">
                            Applications take 5 minutes. Approval takes 48 hours. If you&apos;re not approved, we&apos;ll tell you
                            why — and what you can do to qualify later.
                        </p>
                        <div className="mt-6 flex flex-col gap-2 text-sm text-white/70">
                            {[
                                'Founding rate locked in for life',
                                'Priority lead access in your area',
                                'Free profile setup and onboarding',
                            ].map((item) => (
                                <div key={item} className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Form */}
                    <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
                        <h3 className="text-lg font-semibold text-[#1C2B3A]">Apply for early access</h3>
                        <p className="mt-1 text-sm text-[#2F3E4E]/60">We&apos;ll be in touch within 48 hours.</p>
                        <form className="mt-5 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs font-medium text-[#1C2B3A]">Full name</label>
                                    <input
                                        type="text"
                                        className="mt-1 w-full rounded-lg border border-[#E8E4DD] px-3 py-2.5 text-sm text-[#1C2B3A] placeholder:text-[#2F3E4E]/30 focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20"
                                        placeholder="James van der Berg"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[#1C2B3A]">Business name</label>
                                    <input
                                        type="text"
                                        className="mt-1 w-full rounded-lg border border-[#E8E4DD] px-3 py-2.5 text-sm text-[#1C2B3A] placeholder:text-[#2F3E4E]/30 focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20"
                                        placeholder="VdB Plumbing"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#1C2B3A]">Primary trade</label>
                                <select className="mt-1 w-full rounded-lg border border-[#E8E4DD] px-3 py-2.5 text-sm text-[#1C2B3A] focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20 bg-white">
                                    <option value="">Select trade…</option>
                                    {['Plumbing', 'Electrical', 'Roofing', 'Waterproofing', 'Painting', 'Tiling', 'Carpentry', 'General Handyman', 'Other'].map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#1C2B3A]">Operating areas</label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {['Cape Town Metro', 'Winelands', 'Helderberg', 'Overberg'].map((area) => (
                                        <label key={area} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E8E4DD] px-3 py-1.5 text-xs text-[#1C2B3A] hover:border-[#C45C3A]/40">
                                            <input type="checkbox" className="accent-[#C45C3A]" />
                                            {area}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs font-medium text-[#1C2B3A]">Phone</label>
                                    <input
                                        type="tel"
                                        className="mt-1 w-full rounded-lg border border-[#E8E4DD] px-3 py-2.5 text-sm text-[#1C2B3A] placeholder:text-[#2F3E4E]/30 focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20"
                                        placeholder="071 000 0000"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[#1C2B3A]">Email</label>
                                    <input
                                        type="email"
                                        className="mt-1 w-full rounded-lg border border-[#E8E4DD] px-3 py-2.5 text-sm text-[#1C2B3A] placeholder:text-[#2F3E4E]/30 focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20"
                                        placeholder="you@business.co.za"
                                    />
                                </div>
                            </div>
                            <Button asChild size="lg" className="w-full bg-[#C45C3A] text-white hover:bg-[#A84D30]">
                                <Link href="/contractors/network">
                                    Submit application
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            <p className="text-center text-xs text-[#2F3E4E]/40">
                                Your details are kept private. We&apos;ll WhatsApp you within 48 hours.
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

export function Land2Footer() {
    return (
        <footer className="bg-[#1C2B3A] py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2 lg:col-span-1">
                        <p className="text-base font-semibold text-white">
                            mend<span className="text-[#C45C3A]">r</span>
                            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-white/60">
                                Pro
                            </span>
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-white/50">
                            Pre-diagnosed homeowner leads for Western Cape contractors. Zero commission, flat
                            subscription.
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Platform</p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['How it works', '#how-it-works'],
                                ['Lead quality', '#lead-quality'],
                                ['Pricing', '#pricing'],
                                ['Apply now', '#apply'],
                            ].map(([label, href]) => (
                                <Link
                                    key={label}
                                    href={href}
                                    className="text-sm text-white/50 transition-colors hover:text-white"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Company</p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['For Homeowners', '/landing1'],
                                ['Contact', '/contact'],
                                ['Privacy Policy', '/privacy'],
                                ['Terms of Service', '/terms'],
                            ].map(([label, href]) => (
                                <Link
                                    key={label}
                                    href={href}
                                    className="text-sm text-white/50 transition-colors hover:text-white"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Founding phase</p>
                        <p className="mt-4 text-sm text-white/50">
                            Standard pricing launches once we reach our initial homeowner adoption targets. Founding
                            members are protected regardless of when that happens.
                        </p>
                    </div>
                </div>
                <div className="mt-12 border-t border-white/10 pt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/30">© {new Date().getFullYear()} Mendr Technologies (Pty) Ltd, Cape Town.</p>
                    <p className="text-xs text-white/20">Built in the Western Cape.</p>
                </div>
            </div>
        </footer>
    );
}
