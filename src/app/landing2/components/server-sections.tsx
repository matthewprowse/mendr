import Link from 'next/link';
import { CheckCircle, XCircle, MapPin, Target, Scale, Compass, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Section 2.2 — Anti-Pattern Callout ─────────────────────────────────── */

export function Land2AntiPattern() {
    const statements = [
        'You’ve answered the same vague enquiry four times this week — because three other providers got the same lead.',
        'You’ve quoted someone who couldn’t actually describe the problem, and you have no idea whether they’re shopping you or serious.',
        'You’ve paid for leads that converted nowhere — because there was no context, no qualification, and no exclusivity.',
    ];

    return (
        <section className="bg-[#1C2B3A] py-20 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
                <div className="space-y-8">
                    {statements.map((s, i) => (
                        <p
                            key={i}
                            className="text-lg leading-relaxed text-white/75 sm:text-xl"
                        >
                            {s}
                        </p>
                    ))}
                </div>
                <p className="mt-12 font-[family-name:var(--font-playfair)] text-2xl font-bold text-white sm:text-3xl">
                    Mendr is built to fix all three.
                </p>
            </div>
        </section>
    );
}

/* ─── Section 2.3 — How It Works (Provider) ──────────────────────────────── */

const CONTRACTOR_STEPS = [
    {
        num: '01',
        title: 'Apply to join',
        body: 'Send us your business details, the trades you work in, and the areas you cover. We review every application by hand — not to gatekeep, but to keep the network’s quality stable. The form takes about five minutes. Approval is usually within a few business days.',
        alt: 'Mendr provider application form showing trade category and service area fields.',
    },
    {
        num: '02',
        title: 'Build your profile',
        body: 'Add photos of recent work, list your specialisations, mention any credentials, and write a few lines about your business. Or let Mendr’s AI generate a starter bio from your details — you can edit it. Better profiles get more visibility and more enquiries that turn into work.',
        alt: 'Mendr provider profile setup showing photo gallery, bio, and specialisation tags.',
    },
    {
        num: '03',
        title: 'Get enquiries with context already attached',
        body: 'When a homeowner picks you, you’ll get an enquiry with their diagnosis report attached. You’ll know what they think is wrong, how confident the diagnosis is, what severity it’s at, and what they’ve already noticed. First conversations skip straight to the useful bit. You decide which enquiries to accept and how to respond.',
        alt: 'Mendr provider inbox showing multiple homeowner enquiries with attached diagnosis reports.',
    },
];

export function Land2HowItWorks() {
    return (
        <section id="how-it-works" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        How it works
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        How Mendr Works For Pros
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        A cleaner workflow, from application to enquiry.
                    </p>
                </div>

                <div className="space-y-12 sm:space-y-16">
                    {CONTRACTOR_STEPS.map((step, idx) => {
                        const reverse = idx % 2 === 1;
                        return (
                            <div
                                key={step.num}
                                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
                            >
                                <div className={reverse ? 'order-1 lg:order-2' : 'order-1'}>
                                    <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#E8E4DD] bg-[#1C2B3A] p-1 shadow-lg">
                                        <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#0F1C2D] text-7xl font-bold text-[#C45C3A]/30">
                                            {step.num}
                                        </div>
                                    </div>
                                    <span className="sr-only">{step.alt}</span>
                                </div>
                                <div className={reverse ? 'order-2 lg:order-1' : 'order-2'}>
                                    <h3 className="font-[family-name:var(--font-playfair)] text-2xl font-bold text-[#1C2B3A] sm:text-3xl">
                                        {step.title}
                                    </h3>
                                    <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/75">
                                        {step.body}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

/* ─── Section 2.4 — Comparison Table ─────────────────────────────────────── */

const COMPARISON: Array<{ dim: string; mendr: string; typical: string }> = [
    { dim: 'Lead exclusivity', mendr: 'One enquiry → one provider', typical: 'Same lead sold to 3+ providers' },
    { dim: 'Lead context', mendr: 'AI diagnosis report attached', typical: 'Free-text: "something is leaking"' },
    { dim: 'Commission on jobs', mendr: 'None — ever', typical: 'Often 10–20%' },
    { dim: 'Pricing model', mendr: 'Flat monthly subscription', typical: 'Per-lead or per-quote bidding' },
    { dim: 'Geographic targeting', mendr: 'Western Cape suburbs with set radius', typical: 'Province- or country-wide' },
    { dim: 'Match logic', mendr: 'Service fit + rating + proximity + recency', typical: 'Bid auction or paid placement' },
    { dim: 'Profile depth', mendr: 'Reviews, photos, specialisations, AI bio', typical: 'Name and phone number' },
    { dim: 'Dispute friction', mendr: 'None — no per-lead spend to dispute', typical: 'Frequent dispute friction' },
];

export function Land2Comparison() {
    return (
        <section className="bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Comparison
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Different From What You&rsquo;re Used To
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/70">
                        We don&rsquo;t sell your lead to four other providers. We don&rsquo;t take a cut of your
                        invoice. We don&rsquo;t pretend the homeowner knows what&rsquo;s wrong when they
                        don&rsquo;t.
                    </p>
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-hidden rounded-2xl border border-[#E8E4DD] bg-white shadow-sm sm:block">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E8E4DD] bg-[#FAFAF8]">
                                <th className="px-6 py-4 text-left font-semibold text-[#2F3E4E]/50">
                                    Dimension
                                </th>
                                <th className="px-6 py-4 text-left font-semibold text-[#C45C3A]">
                                    Mendr
                                </th>
                                <th className="px-6 py-4 text-left font-semibold text-[#2F3E4E]/50">
                                    Typical SA Lead Platforms
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPARISON.map((row, i) => (
                                <tr
                                    key={row.dim}
                                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'}
                                >
                                    <td className="px-6 py-4 font-medium text-[#1C2B3A]">
                                        {row.dim}
                                    </td>
                                    <td className="px-6 py-4 text-[#1C2B3A]">{row.mendr}</td>
                                    <td className="px-6 py-4 text-[#2F3E4E]/65">{row.typical}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile — stacked cards */}
                <div className="space-y-4 sm:hidden">
                    {COMPARISON.map((row) => (
                        <div
                            key={row.dim}
                            className="rounded-2xl border border-[#E8E4DD] bg-white p-5 shadow-sm"
                        >
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#2F3E4E]/50">
                                {row.dim}
                            </p>
                            <div className="mt-3 flex items-start gap-2.5">
                                <CheckCircle
                                    className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]"
                                    strokeWidth={1.75}
                                />
                                <div>
                                    <p className="text-xs font-semibold text-[#C45C3A]">Mendr</p>
                                    <p className="text-sm text-[#1C2B3A]">{row.mendr}</p>
                                </div>
                            </div>
                            <div className="mt-3 flex items-start gap-2.5">
                                <XCircle
                                    className="mt-0.5 h-4 w-4 shrink-0 text-[#2F3E4E]/35"
                                    strokeWidth={1.75}
                                />
                                <div>
                                    <p className="text-xs font-semibold text-[#2F3E4E]/50">
                                        Typical SA Lead Platforms
                                    </p>
                                    <p className="text-sm text-[#2F3E4E]/65">{row.typical}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="mt-6 text-center text-xs italic text-[#2F3E4E]/50">
                    Comparison reflects publicly documented practices of major South African lead-generation and
                    home-services platforms as of 2026.
                </p>
            </div>
        </section>
    );
}

/* ─── Section 2.5 — Why Providers Join (Bento) ───────────────────────────── */

type BentoItem = { title: string; body: string; span: string; dark?: boolean; accent?: boolean };

const BENTO: BentoItem[] = [
    {
        title: 'Higher-intent enquiries.',
        body: 'Homeowners come in after diagnosis, not cold browsing. Every enquiry has the trade, the likely fault, the severity, and the homeowner’s own description already attached.',
        span: 'sm:col-span-2',
        dark: true,
    },
    {
        title: 'Less wasted quoting.',
        body: 'Report-first conversations skip the usual ten messages of clarification. You spend less time figuring out what they meant and more time quoting and doing the work.',
        span: 'sm:col-span-2',
    },
    {
        title: 'Better first visits.',
        body: 'Your team can prepare with real context — right tools, right parts, right expectations.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Zero commission.',
        body: 'Mendr doesn’t take a cut of any job. Ever. Our revenue is provider subscriptions, not your invoices.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Visibility where you work.',
        body: 'Matching weighs your specialisation and your proximity. You appear for the right homeowners in the right suburbs.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Profile-led trust.',
        body: 'Photos, reviews, and specialisations help homeowners pick you with confidence — and lift conversion on the enquiries you receive.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Built for sustainable growth.',
        body: 'As diagnosis volume grows, qualified lead volume compounds with it. Founding providers are positioned at the front of that curve.',
        span: 'sm:col-span-2',
        accent: true,
    },
    {
        title: 'Long-term quality, not short-term churn.',
        body: 'Match logic is continuously refined from real platform feedback. The platform gets better as the network grows — not as you pay more.',
        span: 'sm:col-span-2',
    },
];

export function Land2Bento() {
    return (
        <section id="why" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Why join
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Why Providers Join Mendr
                    </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    {BENTO.map((item) => (
                        <div
                            key={item.title}
                            className={[
                                'rounded-2xl p-6',
                                item.span,
                                item.dark
                                    ? 'bg-[#1C2B3A] text-white'
                                    : item.accent
                                      ? 'bg-[#C45C3A] text-white'
                                      : 'border border-[#E8E4DD] bg-white',
                            ].join(' ')}
                        >
                            <h3
                                className={[
                                    'text-lg font-semibold',
                                    item.dark || item.accent ? 'text-white' : 'text-[#1C2B3A]',
                                ].join(' ')}
                            >
                                {item.title}
                            </h3>
                            <p
                                className={[
                                    'mt-2 text-sm leading-relaxed',
                                    item.dark
                                        ? 'text-white/70'
                                        : item.accent
                                          ? 'text-white/80'
                                          : 'text-[#2F3E4E]/70',
                                ].join(' ')}
                            >
                                {item.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─── Section 2.6 — Ranking Algorithm Explainer ──────────────────────────── */

const RANKING_CARDS = [
    {
        icon: Target,
        title: 'Service Relevance',
        body: 'How closely your trade and specialisation match the diagnosed fault. A damp specialist will rank above a general handyman for a damp diagnosis, even if the handyman is closer.',
    },
    {
        icon: Scale,
        title: 'Bayesian-Smoothed Rating',
        body: 'Your average review score, smoothed so a couple of five-star ratings can’t make a sparse profile look better than it is. Long-term consistency beats short-term spikes.',
    },
    {
        icon: Compass,
        title: 'Geographic Proximity',
        body: 'Distance from your operating base to the homeowner’s address. You set your radius. We respect it.',
    },
    {
        icon: Activity,
        title: 'Recent Activity',
        body: 'Active profiles rank above dormant ones. Keep your profile fresh and you stay visible.',
    },
];

export function Land2Ranking() {
    return (
        <section className="bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Transparent ranking
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        How Matching Works — No Black Box
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        Four signals, weighted by relevance to the homeowner&rsquo;s specific problem.
                    </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {RANKING_CARDS.map((c) => {
                        const Icon = c.icon;
                        return (
                            <div
                                key={c.title}
                                className="rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#C45C3A]/10">
                                    <Icon className="h-5 w-5 text-[#C45C3A]" strokeWidth={1.75} />
                                </div>
                                <h3 className="mt-4 text-base font-semibold text-[#1C2B3A]">
                                    {c.title}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-[#2F3E4E]/70">
                                    {c.body}
                                </p>
                            </div>
                        );
                    })}
                </div>

                <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-[#E8E4DD] bg-white p-5 text-sm leading-relaxed text-[#2F3E4E]/75">
                    Profile completeness adds a small but meaningful boost. Providers with photos, a detailed
                    bio, and listed specialisations consistently outperform sparse profiles with identical
                    ratings. Reviews from outside Mendr (Google Places) also count toward your rating.
                </div>
            </div>
        </section>
    );
}

/* ─── Section 2.8 — Provider Testimonials + Mini Case Study ──────────────── */

const CONTRACTOR_TESTIMONIALS = [
    {
        initials: 'PV',
        quote:
            'The first Mendr enquiry I got came with a report that diagnosed a thermostat failure. I walked in with the right part. The customer hired me on the spot. That’s not how Snupit ever felt.',
        name: 'Pieter',
        business: 'Coastal Geyser Services',
        area: 'Bellville',
    },
    {
        initials: 'AN',
        quote:
            'What I like is no commission and no shared leads. I’d rather pay R649 a month and know that when an enquiry comes in, it’s mine to convert.',
        name: 'Anele',
        business: 'Bright Spark Electrical',
        area: 'Mowbray',
    },
    {
        initials: 'SU',
        quote:
            'I was sceptical of the AI angle. But the diagnoses we see attached to enquiries are usually solid — and even when they’re slightly off, the homeowner has already thought about the problem properly. That’s a huge head start.',
        name: 'Sue',
        business: 'Cape Damp Solutions',
        area: 'Tokai',
    },
];

export function Land2Testimonials() {
    return (
        <section className="bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        What providers say
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        What Providers Say About Mendr
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        Real quotes from real Western Cape pros. Names and businesses with permission.
                    </p>
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
                                    <p className="text-xs text-[#2F3E4E]/55">
                                        {t.business} · {t.area}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-4 flex-1 text-sm leading-relaxed text-[#2F3E4E]/75">
                                &ldquo;{t.quote}&rdquo;
                            </p>
                        </div>
                    ))}
                </div>

                {/* Mini case study */}
                <div className="mt-12 rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm sm:p-8">
                    <h3 className="font-[family-name:var(--font-playfair)] text-2xl font-bold text-[#1C2B3A]">
                        From application to first job in 11 days
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/75">
                        Coastal Geyser Services applied for Mendr in March 2026. Their profile was approved
                        within three business days. They added eight photos of recent installations and a short
                        bio listing geyser, solar geyser, and heat-pump specialisations. Eight days after going
                        live, they received their first homeowner enquiry — a geyser leak diagnosis in
                        Bellville. The job converted into a R3,800 replacement. Three more enquiries followed
                        in the following two weeks. Their first paid invoice using the platform settled before
                        they&rsquo;d spent a cent on Mendr.
                    </p>
                    <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl bg-[#F4EFE6] p-5 text-center">
                        <div>
                            <p className="font-[family-name:var(--font-playfair)] text-xl font-bold text-[#1C2B3A] sm:text-2xl">
                                11
                            </p>
                            <p className="mt-1 text-xs text-[#2F3E4E]/60">days to first job</p>
                        </div>
                        <div>
                            <p className="font-[family-name:var(--font-playfair)] text-xl font-bold text-[#1C2B3A] sm:text-2xl">
                                R0
                            </p>
                            <p className="mt-1 text-xs text-[#2F3E4E]/60">commission paid to Mendr</p>
                        </div>
                        <div>
                            <p className="font-[family-name:var(--font-playfair)] text-xl font-bold text-[#1C2B3A] sm:text-2xl">
                                4
                            </p>
                            <p className="mt-1 text-xs text-[#2F3E4E]/60">enquiries in first month</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Section 2.9 — Coverage (provider-facing) ───────────────────────────── */

const PROVIDER_SUBURBS = [
    'Cape Town · City Bowl',
    'Sea Point',
    'Camps Bay',
    'Atlantic Seaboard',
    'Observatory',
    'Woodstock',
    'Pinelands',
    'Rondebosch',
    'Newlands',
    'Claremont',
    'Wynberg',
    'Tokai',
    'Constantia',
    'Hout Bay',
    'Fish Hoek',
    'Bellville',
    'Durbanville',
    'Stellenbosch',
    'Somerset West',
    'Strand',
    'Helderberg',
    'Paarl',
    'Wellington',
    'Brackenfell',
];

const TRADES = [
    'Plumbing',
    'Electrical',
    'Damp & Waterproofing',
    'Roofing',
    'Structural',
    'General Home Maintenance',
];

export function Land2Coverage() {
    return (
        <section id="coverage" className="scroll-mt-20 bg-[#E8E4DD] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-start gap-12 lg:grid-cols-2">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                            Where Mendr operates
                        </p>
                        <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                            Where Mendr Operates
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-[#2F3E4E]/75">
                            Mendr&rsquo;s homeowner base is concentrated in the Cape Town metropolitan area and
                            growing through the Helderberg and Cape Winelands. If you operate anywhere in the
                            Western Cape, you can apply now and be visible to homeowners in your radius.
                        </p>

                        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-[#1C2B3A]/50">
                            Trades supported
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {TRADES.map((t) => (
                                <span
                                    key={t}
                                    className="rounded-full border border-[#1C2B3A]/15 bg-white px-3 py-1 text-xs font-medium text-[#1C2B3A]"
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#1C2B3A]/50">
                            Suburbs with active homeowner traffic
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                            {PROVIDER_SUBURBS.map((s) => (
                                <span
                                    key={s}
                                    className="flex items-center gap-2 text-sm text-[#1C2B3A]"
                                >
                                    <MapPin
                                        className="h-3 w-3 text-[#C45C3A]"
                                        strokeWidth={1.75}
                                    />
                                    <span className="truncate">{s}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Section 2.11 — Final CTA ───────────────────────────────────────────── */

export function Land2ApplicationCta() {
    return (
        <section id="apply" className="scroll-mt-20 bg-[#C45C3A] py-20 sm:py-24">
            <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
                <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-white sm:text-4xl">
                    Join The Founding Network
                </h2>
                <p className="mt-4 text-lg text-white/85">
                    Free to apply. No commission. Built for Western Cape pros.
                </p>
                <Button
                    asChild
                    size="lg"
                    className="mt-8 bg-white font-semibold text-[#C45C3A] shadow-lg hover:bg-white/90"
                >
                    <Link href="/contractors/network">Apply To Join The Network</Link>
                </Button>
                <p className="mt-4 text-sm text-white/65">About five minutes · No card required</p>
            </div>
        </section>
    );
}

/* ─── Section 2.12 — Footer ──────────────────────────────────────────────── */

export function Land2Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="bg-[#1C2B3A] py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <p className="text-base font-semibold text-white">
                            mend<span className="text-[#C45C3A]">r</span>
                            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-white/60">
                                Pro
                            </span>
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-white/55">
                            Built in Cape Town. For the Western Cape.
                        </p>
                        <div className="mt-5 flex gap-3 text-xs uppercase tracking-wider text-white/30">
                            <a
                                href="https://x.com/"
                                className="transition-colors hover:text-white"
                                aria-label="Mendr on X"
                            >
                                X
                            </a>
                            <a
                                href="https://linkedin.com/"
                                className="transition-colors hover:text-white"
                                aria-label="Mendr on LinkedIn"
                            >
                                LinkedIn
                            </a>
                            <a
                                href="https://instagram.com/"
                                className="transition-colors hover:text-white"
                                aria-label="Mendr on Instagram"
                            >
                                Instagram
                            </a>
                            <a
                                href="https://facebook.com/"
                                className="transition-colors hover:text-white"
                                aria-label="Mendr on Facebook"
                            >
                                Facebook
                            </a>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                            Explore
                        </p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['How It Works', '#how-it-works'],
                                ['Why Join', '#why'],
                                ['Pricing', '#pricing'],
                                ['FAQ', '#faq'],
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                            Mendr
                        </p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['About', '/about'],
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
                </div>

                <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/30">© {year} Mendr. Built in Cape Town.</p>
                    <p className="text-xs text-white/30">Diagnose. Decide. Done.</p>
                </div>
            </div>
        </footer>
    );
}
