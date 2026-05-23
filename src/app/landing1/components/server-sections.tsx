import Link from 'next/link';
import { MapPin, Star, Droplet, Zap, Home, Hammer, Building2, Paintbrush } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Section 1.2 — Problem Framing ──────────────────────────────────────── */

const SCENARIOS = [
    {
        title: 'A damp patch appeared on your wall.',
        body: 'Is it rising damp, penetrating damp, or just a leaky pipe behind the plaster?',
        href: '/start?trade=damp',
    },
    {
        title: 'Your geyser is making a noise — or leaking.',
        body: 'Is it the thermostat, the element, the tank, or just a seal?',
        href: '/start?trade=plumbing',
    },
    {
        title: 'Your DB board keeps tripping.',
        body: 'Is it the geyser circuit, an appliance, or something more serious?',
        href: '/start?trade=electrical',
    },
];

export function Land1ProblemFraming() {
    return (
        <section className="bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Most People Pay For Repairs Without Knowing What&rsquo;s Actually Wrong
                    </h2>
                    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#2F3E4E]/75">
                        You spot a damp patch on the wall. You hear a noise from the geyser. You smell something
                        funny from a plug. So you Google &ldquo;plumber near me,&rdquo; call three numbers, and
                        explain the same vague story three times. You get three very different quotes — and no
                        real way to compare them, because you don&rsquo;t know what the problem is.
                    </p>
                    <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#2F3E4E]/75">
                        That&rsquo;s how most people end up paying too much. Not because tradespeople are
                        dishonest — because you walked into the conversation without context. Mendr fixes that
                        part first.
                    </p>
                    <p className="mx-auto mt-5 max-w-2xl text-sm italic text-[#2F3E4E]/55">
                        South African consumer guidance recommends getting itemised quotes for jobs over R2,000.
                        Itemised quotes only help if you know what the line items should be.
                    </p>
                </div>

                <div className="mt-14 grid gap-4 sm:grid-cols-3">
                    {SCENARIOS.map((s) => (
                        <Link
                            key={s.title}
                            href={s.href}
                            className="group flex flex-col rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                        >
                            <h3 className="text-base font-semibold text-[#1C2B3A]">{s.title}</h3>
                            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#2F3E4E]/70">
                                {s.body}
                            </p>
                            <span className="mt-4 text-sm font-medium text-[#C45C3A]">
                                Find out &rarr;
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─── Section 1.4 — Trade Rails ──────────────────────────────────────────── */

const TRADES = [
    {
        slug: 'plumbing',
        name: 'Plumbing',
        icon: Droplet,
        descriptor: 'Leaks, low water pressure, geyser problems, blocked drains.',
        examples: 'Geyser leaking · Low pressure on hot taps · A drain that won’t drain',
        href: '/diagnose/plumbing',
    },
    {
        slug: 'electrical',
        name: 'Electrical',
        icon: Zap,
        descriptor: 'Tripping circuits, DB board faults, post-load-shedding damage.',
        examples: 'DB board keeps tripping · Burnt smell from a plug · Geyser circuit not working',
        href: '/diagnose/electrical',
    },
    {
        slug: 'damp',
        name: 'Damp & Waterproofing',
        icon: Paintbrush,
        descriptor: 'Tell rising damp from penetrating damp from condensation.',
        examples: 'Damp patch on an internal wall · Mould around the ceiling · Paint bubbling near the floor',
        href: '/diagnose/damp',
    },
    {
        slug: 'roofing',
        name: 'Roofing',
        icon: Home,
        descriptor: 'Tile damage, leaking ridges, broken gutters, post-storm problems.',
        examples: 'Ceiling leaking after rain · A cracked or missing tile · A gutter pulling away',
        href: '/diagnose/roofing',
    },
    {
        slug: 'structural',
        name: 'Structural',
        icon: Building2,
        descriptor: 'Cracks, settlement, sagging — cosmetic or something to worry about?',
        examples: 'A new crack in the wall · A floor that feels uneven · A door that suddenly won’t close',
        href: '/diagnose/structural',
    },
    {
        slug: 'maintenance',
        name: 'General Maintenance',
        icon: Hammer,
        descriptor: 'Anything else — fixtures, fittings, finishes, handyman-scope.',
        examples: 'A sticking door · A loose tile · A hinge that’s pulled out of the wood',
        href: '/diagnose/maintenance',
    },
];

export function Land1TradeRails() {
    return (
        <section id="trades" className="scroll-mt-20 bg-white py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Trades supported
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        What Can Mendr Help With?
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        Six categories of home fault. If yours spans more than one, the report will tell you.
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {TRADES.map((trade) => {
                        const Icon = trade.icon;
                        return (
                            <Link
                                key={trade.slug}
                                href={trade.href}
                                className="group flex flex-col rounded-2xl border border-[#E8E4DD] bg-[#FAFAF8] p-6 shadow-sm transition-all hover:border-[#C45C3A]/30 hover:shadow-md"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C45C3A]/10">
                                    <Icon className="h-5 w-5 text-[#C45C3A]" strokeWidth={1.75} />
                                </div>
                                <h3 className="mt-5 text-lg font-semibold text-[#1C2B3A]">
                                    {trade.name}
                                </h3>
                                <p className="mt-2 text-sm text-[#2F3E4E]/70">{trade.descriptor}</p>
                                <p className="mt-3 text-xs leading-relaxed text-[#2F3E4E]/55">
                                    {trade.examples}
                                </p>
                                <span className="mt-5 text-sm font-medium text-[#C45C3A]">
                                    Diagnose a {trade.name.toLowerCase()} issue &rarr;
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

/* ─── Section 1.5 — Why Mendr (Bento) ────────────────────────────────────── */

type BentoItem = { title: string; body: string; span: string; dark?: boolean; accent?: boolean };

const BENTO: BentoItem[] = [
    {
        title: 'Know what’s wrong before you call.',
        body: 'Walk into every conversation with the same context the tradesperson would have to pull out of you on the phone. Useful for first calls, second opinions, and comparing quotes.',
        span: 'sm:col-span-2',
        dark: true,
    },
    {
        title: 'Stop guessing.',
        body: 'Get a structured report with likely cause, severity, confidence, and recommended next steps. Not a guess — a starting point built from your photo and what you told us.',
        span: 'sm:col-span-2',
    },
    {
        title: 'Comparable quotes.',
        body: 'Send the same report to three providers. Compare scope and price, not who understood you best.',
        span: 'sm:col-span-1',
    },
    {
        title: 'No account. No commission.',
        body: 'Get a report without signing up. We never sell your details. You decide who sees the report.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Built for here.',
        body: 'Coastal damp. Load-shedding damage. Winter roof storms. The context national platforms miss.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Your report stays private.',
        body: 'Reports are private by default. Sharing is always a choice you make — never automatic.',
        span: 'sm:col-span-1',
    },
    {
        title: 'Better information up front.',
        body: 'A clearer starting point usually leads to fairer quotes, smaller scope creep, and fewer surprises during the job. Mendr is the pre-work step everyone else skips.',
        span: 'sm:col-span-2',
        accent: true,
    },
    {
        title: 'Designed for everyone — not just tech people.',
        body: 'Built so a 19-year-old with a leaky tap and an 85-year-old with a damp wall can both use it. Take a photo. Tell us what you see. That’s all you need to do.',
        span: 'sm:col-span-2',
    },
];

export function Land1BentoGrid() {
    return (
        <section id="why" className="scroll-mt-20 bg-[#F4EFE6] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                        Why Mendr
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Why People Use Mendr
                    </h2>
                    <p className="mt-4 text-base text-[#2F3E4E]/70">
                        Built for homeowners, not for the platform.
                    </p>
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

/* ─── Section 1.6 — Trust Band ───────────────────────────────────────────── */

const STATS = [
    { value: '700+', label: 'reports generated' },
    { value: '6', label: 'trade categories' },
    { value: '40+', label: 'Western Cape suburbs covered' },
    { value: '~45s', label: 'average diagnosis time' },
];

const TESTIMONIALS = [
    {
        quote:
            'I was about to pay R8,500 to “waterproof the whole bathroom.” Mendr told me it was a single failed silicone seal. The plumber came, confirmed it, charged me R600.',
        name: 'Sarah',
        suburb: 'Tokai',
        initials: 'S',
    },
    {
        quote:
            'I sent the same Mendr report to three electricians instead of explaining the problem three times. The quotes were finally comparable. Easier decision than I expected.',
        name: 'Marius',
        suburb: 'Stellenbosch',
        initials: 'M',
    },
    {
        quote:
            'Used it for damp. The report said penetrating damp, not rising damp. Saved me from booking the wrong kind of specialist.',
        name: 'Naledi',
        suburb: 'Sea Point',
        initials: 'N',
    },
];

export function Land1TrustBand() {
    return (
        <section className="bg-[#FAFAF8] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-2xl text-center">
                    <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                        Honest About What This Is — And Isn&rsquo;t
                    </h2>
                </div>

                {/* Stat ribbon */}
                <div className="mb-12 grid grid-cols-2 gap-4 rounded-2xl border border-[#E8E4DD] bg-white px-6 py-6 sm:grid-cols-4">
                    {STATS.map((s) => (
                        <div key={s.label} className="text-center">
                            <p className="font-[family-name:var(--font-playfair)] text-2xl font-bold text-[#1C2B3A] sm:text-3xl">
                                {s.value}
                            </p>
                            <p className="mt-1 text-xs text-[#2F3E4E]/60 sm:text-sm">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Testimonials */}
                <div className="grid gap-6 sm:grid-cols-3">
                    {TESTIMONIALS.map((t) => (
                        <div
                            key={t.name}
                            className="flex flex-col rounded-2xl border border-[#E8E4DD] bg-white p-6 shadow-sm"
                        >
                            <div className="flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                    <Star
                                        key={i}
                                        className="h-3.5 w-3.5 fill-[#C8973A] text-[#C8973A]"
                                    />
                                ))}
                            </div>
                            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#2F3E4E]/75">
                                &ldquo;{t.quote}&rdquo;
                            </p>
                            <div className="mt-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C45C3A] text-sm font-semibold text-white">
                                    {t.initials}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#1C2B3A]">{t.name}</p>
                                    <p className="text-xs text-[#2F3E4E]/50">{t.suburb}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="mx-auto mt-10 max-w-3xl text-center text-sm italic leading-relaxed text-[#2F3E4E]/55">
                    Mendr&rsquo;s diagnosis is a strong starting point — it&rsquo;s not a final verdict. Every
                    report comes with a confidence score so you know how sure it is. A tradesperson still needs
                    to come look. We&rsquo;d rather be useful and honest than confident and wrong.
                </p>
            </div>
        </section>
    );
}

/* ─── Section 1.7 — Coverage ─────────────────────────────────────────────── */

const SUBURBS = [
    'Cape Town · City Bowl',
    'Gardens',
    'Sea Point',
    'Green Point',
    'Camps Bay',
    'Atlantic Seaboard',
    'Observatory',
    'Woodstock',
    'Salt River',
    'Pinelands',
    'Rondebosch',
    'Newlands',
    'Claremont',
    'Kenilworth',
    'Wynberg',
    'Tokai',
    'Constantia',
    'Hout Bay',
    'Fish Hoek',
    'Bellville',
    'Durbanville',
    'Stellenbosch',
    'Somerset West',
    'Paarl',
];

export function Land1Coverage() {
    return (
        <section id="coverage" className="scroll-mt-20 bg-[#E8E4DD] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-start gap-12 lg:grid-cols-2">
                    {/* Left: copy + map */}
                    <div>
                        <p className="text-sm font-medium uppercase tracking-widest text-[#C45C3A]">
                            Coverage
                        </p>
                        <h2 className="mt-3 font-[family-name:var(--font-playfair)] text-3xl font-bold text-[#1C2B3A] sm:text-4xl">
                            Built For The Western Cape
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-[#2F3E4E]/75">
                            Mendr works for homeowners across the Western Cape — from the City Bowl and Atlantic
                            Seaboard through the Southern Suburbs, the Northern Suburbs, the Helderberg, and out
                            into the Winelands. If you can take a photo and describe what you&rsquo;re seeing, we
                            can produce a report. Provider matching is most active in the metro and expanding as
                            the network grows.
                        </p>

                        <div
                            className="relative mt-8 overflow-hidden rounded-2xl bg-[#1C2B3A] p-6"
                            aria-label="Map of the Western Cape showing Mendr service zones across Cape Town, the Helderberg, and the Cape Winelands."
                        >
                            <svg
                                viewBox="0 0 240 180"
                                className="mx-auto h-44 w-full opacity-80"
                                fill="none"
                                aria-hidden
                            >
                                <path
                                    d="M40,30 C70,20 130,15 180,40 C210,55 220,85 215,115 C205,145 175,165 140,170 C100,175 60,160 35,135 C15,110 18,75 30,55 C35,45 40,38 40,30 Z"
                                    fill="#C45C3A"
                                    opacity="0.25"
                                />
                                <path
                                    d="M40,30 C70,20 130,15 180,40 C210,55 220,85 215,115 C205,145 175,165 140,170 C100,175 60,160 35,135 C15,110 18,75 30,55 C35,45 40,38 40,30 Z"
                                    stroke="#C45C3A"
                                    strokeWidth="1.5"
                                />
                                {[
                                    [90, 90],
                                    [110, 80],
                                    [130, 95],
                                    [100, 110],
                                    [140, 85],
                                    [85, 110],
                                    [115, 115],
                                    [155, 100],
                                    [125, 70],
                                    [70, 95],
                                ].map(([cx, cy], i) => (
                                    <circle
                                        key={i}
                                        cx={cx}
                                        cy={cy}
                                        r="3.5"
                                        fill="#6B8F71"
                                        opacity="0.9"
                                    />
                                ))}
                            </svg>
                            <p className="mt-4 text-center text-xs text-white/50">
                                Western Cape · Cape Town Metro · Helderberg · Winelands
                            </p>
                        </div>
                    </div>

                    {/* Right: suburb grid */}
                    <div>
                        <p className="text-sm font-medium uppercase tracking-widest text-[#1C2B3A]/50">
                            Suburbs covered
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                            {SUBURBS.map((s) => {
                                const slug = s
                                    .toLowerCase()
                                    .replace(/[·]/g, '')
                                    .replace(/\s+/g, '-')
                                    .replace(/[^a-z0-9-]/g, '');
                                return (
                                    <Link
                                        key={s}
                                        href={`/find-a-pro/${slug}`}
                                        className="flex items-center gap-2 text-sm text-[#1C2B3A] transition-colors hover:text-[#C45C3A]"
                                    >
                                        <MapPin
                                            className="h-3 w-3 text-[#C45C3A]"
                                            strokeWidth={1.75}
                                        />
                                        <span className="truncate">{s}</span>
                                    </Link>
                                );
                            })}
                        </div>
                        <p className="mt-6 text-sm text-[#2F3E4E]/55">
                            Don&rsquo;t see your suburb? Mendr&rsquo;s diagnosis still works anywhere in the
                            Western Cape — provider matching is expanding outward from the metro.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Section 1.9 — Final CTA ────────────────────────────────────────────── */

export function Land1FinalCta() {
    return (
        <section className="bg-[#C45C3A] py-20 sm:py-24">
            <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
                <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold text-white sm:text-4xl">
                    Find Out What&rsquo;s Likely Wrong — Before You Pay For A Call-Out
                </h2>
                <p className="mt-4 text-lg text-white/80">
                    Free for Western Cape homeowners. No account, no payment details. Your report stays yours.
                </p>
                <Button
                    asChild
                    size="lg"
                    className="mt-8 bg-white font-semibold text-[#C45C3A] shadow-lg hover:bg-white/90"
                >
                    <Link href="/start">Generate Free Mendr Report</Link>
                </Button>
                <p className="mt-4 text-sm text-white/60">Under 60 seconds · Works on any phone</p>
            </div>
        </section>
    );
}

/* ─── Section 1.10 — Footer ──────────────────────────────────────────────── */

export function Land1Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="bg-[#1C2B3A] py-14">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Column 1 — wordmark + tagline + socials */}
                    <div>
                        <p className="text-base font-semibold text-white">
                            mend<span className="text-[#C45C3A]">r</span>
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-white/50">
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

                    {/* Column 2 — Explore */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                            Explore
                        </p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['How It Works', '#how-it-works'],
                                ['Why Mendr', '#why'],
                                ['Trades', '#trades'],
                                ['Coverage', '#coverage'],
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

                    {/* Column 3 — Mendr */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                            Mendr
                        </p>
                        <nav className="mt-4 flex flex-col gap-2.5">
                            {[
                                ['About', '/about'],
                                ['For Providers', '/landing2'],
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
