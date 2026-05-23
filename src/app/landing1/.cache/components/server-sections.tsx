import Link from 'next/link';
import { CheckCircle, MapPin, Clock, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Trust Bar ─────────────────────────────────────────────────────────── */

export function Land1TrustBar() {
    const signals = [
        { icon: ShieldCheck, label: 'All contractors manually vetted' },
        { icon: Star, label: '52+ homeowners helped' },
        { icon: Clock, label: 'Avg. diagnosis: 58 seconds' },
        { icon: MapPin, label: 'Western Cape only' },
    ];
    return (
        <div className="bg-[#1C2B3A] py-5">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
                    {signals.map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-[#6B8F71]" strokeWidth={1.5} />
                            <span className="text-sm text-white/70">{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ─── How It Works ──────────────────────────────────────────────────────── */

const STEPS = [
    {
        num: '01',
        icon: '📷',
        title: 'Photograph the problem',
        body: 'Take a photo on your phone — no preparation needed. Bad lighting, messy rooms, the middle of the night. Mendr works with what you\'ve got.',
    },
    {
        num: '02',
        icon: '📋',
        title: 'Get your free diagnosis',
        body: 'Mendr analyses your photo and generates a plain-English fault report in under 60 seconds. You\'ll know the fault type, urgency, likely cause, and a realistic cost range before you speak to anyone.',
    },
    {
        num: '03',
        icon: '✓',
        title: 'Choose a vetted contractor',
        body: 'Browse contractors who\'ve been verified by Mendr and work in your area. No auctions. No bidding wars. Contact whoever you like, directly. Zero commission — for you or them.',
    },
] as const;

export function Land1HowItWorks() {
    return (
        <section id="how-it-works" className="scroll-mt-20 bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">How it works</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Three steps. Under two minutes.
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        From photo to diagnosis to vetted contractor — entirely on your terms.
                    </p>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                    {STEPS.map((step) => (
                        <div
                            key={step.num}
                            className="rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                        >
                            <span className="text-4xl font-bold text-[#E8E4DD]">{step.num}</span>
                            <div className="mt-4 text-2xl">{step.icon}</div>
                            <h3 className="mt-3 text-lg font-semibold text-[#1C2B3A]">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#2F3E4E]/70">{step.body}</p>
                        </div>
                    ))}
                </div>
                <p className="mt-8 text-center text-sm text-[#2F3E4E]/50">
                    Prefer to describe it in words? You can type instead of uploading a photo.
                </p>
            </div>
        </section>
    );
}

/* ─── Bento Grid ────────────────────────────────────────────────────────── */

type BentoItem = { title: string; body: string; span: string; dark?: boolean; accent?: boolean };

const BENTO: BentoItem[] = [
    {
        title: 'Every contractor is manually vetted',
        body: "Not an algorithm. A person checks each contractor's registration, insurance, and references before they appear on Mendr. We'd rather have 50 contractors you can trust than 5,000 you can't.",
        span: 'sm:col-span-2',
        dark: true,
    },
    {
        title: 'Zero commission. For anyone.',
        body: "Mendr doesn't take a cut of your job. The contractor you hire gets paid exactly what they quoted.",
        span: 'sm:col-span-1',
    },
    {
        title: 'Structured quotes by default',
        body: 'Contractors on Mendr send quotes in a consistent format. No more comparing apples with tractor tyres.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Know before you call',
        body: "Mendr's diagnosis means you arrive at every contractor conversation already knowing what the problem is, what it should cost, and what questions to ask. Information is the best negotiating tool you have.",
        span: 'sm:col-span-2',
        accent: true,
    },
    {
        title: 'Only works in the Western Cape',
        body: "Deliberately. We're building something properly, not scaling fast and thin. Every contractor in our network is local.",
        span: 'sm:col-span-1',
    },
    {
        title: 'Describe it your way',
        body: 'Photo, text, or both. Mendr understands context, not just images. "It only leaks when it rains" is useful information.',
        span: 'sm:col-span-1',
    },
];

export function Land1BentoGrid() {
    return (
        <section id="value" className="scroll-mt-20 bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">Why Mendr</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Built differently. On purpose.
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
                                    item.dark ? 'text-white/70' : item.accent ? 'text-white/80' : 'text-[#2F3E4E]/70',
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

/* ─── Testimonials ──────────────────────────────────────────────────────── */

const TESTIMONIALS = [
    {
        initials: 'TK',
        name: 'Thandi K.',
        suburb: 'Newlands',
        fault: 'Roof leak',
        quote: "I had a damp mark on my lounge ceiling for two years. Mendr told me exactly what it was in less than a minute — turned out it was a failed flashing, not a pipe like I thought. The contractor we found quoted me R3,200 and had it sorted in a day. I wish this existed years ago.",
    },
    {
        initials: 'GP',
        name: 'Greg P.',
        suburb: 'Hout Bay',
        fault: 'Electrical',
        quote: "I was convinced I needed to rewire my entire kitchen. Mendr's diagnosis said it was probably just a tripped RCBO and I should check the DB board first. Saved me calling an electrician immediately and panicking. Turned out the diagnosis was right.",
    },
    {
        initials: 'NV',
        name: 'Nadia V.',
        suburb: 'Somerset West',
        fault: 'Geyser diagnosis',
        quote: "The contractor I found through Mendr didn't just fix the problem — he explained everything. I think the diagnostic report sets the tone. He came knowing what the issue was, and so did I.",
    },
] as const;

export function Land1Testimonials() {
    return (
        <section className="bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">What homeowners say</p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Real diagnoses. Real relief.
                    </h2>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                    {TESTIMONIALS.map((t) => (
                        <div
                            key={t.name}
                            className="flex flex-col rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#C45C3A] text-sm font-semibold text-white">
                                    {t.initials}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#1C2B3A]">{t.name}</p>
                                    <p className="text-xs text-[#2F3E4E]/50">{t.suburb}</p>
                                </div>
                                <span className="ml-auto rounded-full bg-[#F4EFE6] px-2.5 py-1 text-xs font-medium text-[#C45C3A]">
                                    {t.fault}
                                </span>
                            </div>
                            <div className="mt-3 flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="h-3.5 w-3.5 fill-[#C8973A] text-[#C8973A]" />
                                ))}
                            </div>
                            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#2F3E4E]/70">&ldquo;{t.quote}&rdquo;</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─── Cape Town Section ─────────────────────────────────────────────────── */

export function Land1CapeTown() {
    return (
        <section className="bg-[#E8E4DD] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-2">
                    {/* Visual panel */}
                    <div className="order-2 lg:order-1 rounded-2xl bg-[#1C2B3A] p-8 text-white">
                        <p className="text-xs font-medium uppercase tracking-widest text-[#6B8F71]">
                            Cape Town specifics
                        </p>
                        <div className="mt-6 space-y-4">
                            {[
                                {
                                    label: 'Penetrating damp',
                                    detail: 'South-facing walls, winter rain. Very common in Cape Dutch and Victorian homes.',
                                },
                                {
                                    label: 'Geyser pressure issues',
                                    detail: 'Cape Town altitude and aging infrastructure mean geysers behave differently here.',
                                },
                                {
                                    label: 'South Easter damage',
                                    detail: 'Roof tiles, shade sails, garden walls — the Cape Doctor causes specific fault patterns.',
                                },
                                {
                                    label: 'Coastal corrosion',
                                    detail: 'Salt air accelerates metal degradation — gutters, roofs, metalwork all degrade faster.',
                                },
                            ].map((item) => (
                                <div key={item.label} className="flex gap-3">
                                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B8F71]" strokeWidth={1.5} />
                                    <div>
                                        <p className="text-sm font-semibold text-white">{item.label}</p>
                                        <p className="text-xs text-white/60">{item.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-8 border-t border-white/10 pt-6 grid grid-cols-3 gap-4 text-center">
                            {[
                                { v: 'Cape Dutch', l: 'Architecture' },
                                { v: 'Victorian', l: 'Architecture' },
                                { v: '1970s brick', l: 'Construction' },
                            ].map((s) => (
                                <div key={s.v}>
                                    <p className="text-xs font-semibold text-white">{s.v}</p>
                                    <p className="text-xs text-white/50">{s.l}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Copy panel */}
                    <div className="order-1 lg:order-2">
                        <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">Why local matters</p>
                        <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                            Cape Town has a unique set of home problems.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-[#2F3E4E]/80">
                            Penetrating damp from south-facing walls. Geyser pressure systems that behave differently at
                            altitude. Termites in the Winelands corridor. Rising damp in older Woodstock builds.
                        </p>
                        <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/80">
                            Cape Town&apos;s stock of Victorian and Cape Dutch homes needs contractors who understand Cape Town
                            materials, Cape Town weather, and Cape Town construction methods. Mendr&apos;s diagnosis engine is
                            trained on South African fault data — not UK leaks or American HVAC problems.
                        </p>
                        <p className="mt-4 text-base font-medium text-[#1C2B3A]">
                            We&apos;re not a national platform that happens to serve Cape Town. We&apos;re a Cape Town platform,
                            full stop.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-2">
                            {['Cape Town Metro', 'Winelands', 'Helderberg', 'Overberg'].map((area) => (
                                <span
                                    key={area}
                                    className="rounded-full border border-[#C45C3A]/20 bg-white px-3 py-1 text-xs font-medium text-[#C45C3A]"
                                >
                                    {area}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Coverage ──────────────────────────────────────────────────────────── */

const SUBURBS = [
    'Atlantic Seaboard',
    'Southern Suburbs',
    'Northern Suburbs',
    'Winelands',
    'Helderberg',
    'Hout Bay',
    'Cape Flats',
    'Overberg',
];

export function Land1Coverage() {
    return (
        <section id="coverage" className="scroll-mt-20 bg-white py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-2">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">Where we operate</p>
                        <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                            Currently serving the Western Cape.
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-[#2F3E4E]/70">
                            Mendr launched in the Western Cape because we wanted to get it right before we scaled. Our
                            contractor network covers the full Cape Town metro and the Winelands corridor.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-2">
                            {SUBURBS.map((s) => (
                                <span
                                    key={s}
                                    className="flex items-center gap-1.5 rounded-full bg-[#F4EFE6] px-3 py-1.5 text-sm text-[#1C2B3A]"
                                >
                                    <MapPin className="h-3 w-3 text-[#C45C3A]" />
                                    {s}
                                </span>
                            ))}
                        </div>
                        <p className="mt-6 text-sm text-[#2F3E4E]/50">
                            Expanding to Knysna and George corridor: Q3 2025. Nationwide when we&apos;re ready.
                        </p>
                        <div className="mt-6 rounded-xl border border-[#E8E4DD] bg-[#F4EFE6] p-4">
                            <p className="text-sm font-medium text-[#1C2B3A]">Not in your area yet?</p>
                            <p className="mt-1 text-sm text-[#2F3E4E]/60">
                                Join the waitlist and we&apos;ll let you know the week we cover your suburb.
                            </p>
                            <div className="mt-3 flex gap-2">
                                <input
                                    type="email"
                                    placeholder="your@email.com"
                                    className="flex-1 rounded-lg border border-[#E8E4DD] bg-white px-3 py-2 text-sm text-[#1C2B3A] placeholder:text-[#2F3E4E]/30 focus:outline-none focus:ring-2 focus:ring-[#C45C3A]/20"
                                />
                                <Button
                                    size="sm"
                                    className="shrink-0 bg-[#1C2B3A] text-white hover:bg-[#1C2B3A]/90"
                                >
                                    Notify me
                                </Button>
                            </div>
                        </div>
                    </div>
                    {/* Stylised map placeholder */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#1C2B3A] p-1">
                        <div className="rounded-xl bg-[#243547] p-8 text-center">
                            <div className="mx-auto flex h-48 w-48 items-center justify-center">
                                {/* Western Cape silhouette approximation */}
                                <svg viewBox="0 0 200 200" className="h-full w-full opacity-60" fill="none">
                                    <path
                                        d="M60,20 C80,15 120,10 150,30 C170,45 180,70 175,100 C168,130 145,155 120,165 C95,175 65,170 45,150 C25,130 20,100 30,75 C40,50 45,25 60,20 Z"
                                        fill="#C45C3A"
                                        opacity="0.4"
                                    />
                                    <path
                                        d="M60,20 C80,15 120,10 150,30 C170,45 180,70 175,100 C168,130 145,155 120,165 C95,175 65,170 45,150 C25,130 20,100 30,75 C40,50 45,25 60,20 Z"
                                        stroke="#C45C3A"
                                        strokeWidth="2"
                                        fill="none"
                                    />
                                    {/* Dots for coverage areas */}
                                    {[
                                        [100, 100],
                                        [80, 90],
                                        [120, 85],
                                        [90, 115],
                                        [130, 110],
                                        [70, 105],
                                        [110, 130],
                                        [95, 75],
                                    ].map(([cx, cy], i) => (
                                        <circle key={i} cx={cx} cy={cy} r="5" fill="#6B8F71" opacity="0.9" />
                                    ))}
                                </svg>
                            </div>
                            <p className="mt-4 text-sm font-medium text-white/80">Western Cape</p>
                            <p className="text-xs text-white/40">8 areas covered · Expanding Q3 2025</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Final CTA ─────────────────────────────────────────────────────────── */

export function Land1FinalCta() {
    return (
        <section className="bg-[#C45C3A] py-20 sm:py-24">
            <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
                <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-white sm:text-4xl">
                    What&apos;s that mark on your ceiling?
                </h2>
                <p className="mt-4 text-lg text-white/80">Find out in 60 seconds. Free.</p>
                <Button
                    asChild
                    size="lg"
                    className="mt-8 bg-white font-semibold text-[#C45C3A] hover:bg-white/90 shadow-lg"
                >
                    <Link href="/start">Upload a photo and start →</Link>
                </Button>
                <p className="mt-4 text-sm text-white/60">No account. No payment. Just an answer.</p>
            </div>
        </section>
    );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

export function Land1Footer() {
    return (
        <footer className="bg-[#1C2B3A] py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2 lg:col-span-1">
                        <p className="text-base font-semibold text-white">
                            mend<span className="text-[#C45C3A]">r</span>
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-white/50">
                            Free AI-powered home fault diagnosis for Western Cape homeowners. Know what&apos;s wrong before
                            you call anyone.
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Product</p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['How it works', '#how-it-works'],
                                ['Coverage', '#coverage'],
                                ['FAQ', '#faq'],
                                ['Get a diagnosis', '/start'],
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Contractors</p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['How it works for pros', '/landing2#how-it-works'],
                                ['Pricing', '/landing2#pricing'],
                                ['Apply now', '/contractors/network'],
                                ['FAQ for contractors', '/landing2#faq'],
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
                <div className="mt-12 border-t border-white/10 pt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/30">© {new Date().getFullYear()} Mendr Technologies (Pty) Ltd, Cape Town.</p>
                    <p className="text-xs text-white/20">Built in the Western Cape.</p>
                </div>
            </div>
        </footer>
    );
}
