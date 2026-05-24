import Link from 'next/link';
import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { LandingHeader } from '@/components/landing-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSiteUrl } from '@/lib/site-url';
import {
    PRICING_TIERS,
    VERIFIED_ADD_ON,
    PRICING_FAQS,
    type PricingTier,
} from './pricing-data';

export const metadata: Metadata = {
    title: 'Pricing — Mendr Pro | R299/mo and up, no commission',
    description:
        'Simple subscription pricing for Western Cape contractors. R299/month for Starter; R699 for Pro; R1,499 for Business. No commission on jobs, ever. Free during founding phase.',
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: 'Pricing — Mendr Pro | R299/mo and up, no commission',
        description:
            'Flat monthly subscriptions for Western Cape contractors. No commission, no per-lead fees. Free during the founding phase.',
        type: 'website',
        url: '/pricing',
        locale: 'en_ZA',
    },
};

function formatRand(value: number): string {
    if (value === 0) return 'R0';
    return `R${value.toLocaleString('en-ZA')}`;
}

function buildPricingJsonLd(base: string) {
    const orgId = `${base}/#organization`;
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: 'Mendr',
                url: base,
            },
            {
                '@type': 'Service',
                name: 'Lead Generation for Home Services Contractors',
                description:
                    'Subscription-based lead generation and operational tooling for Western Cape home services contractors. No commission on completed jobs.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape', addressCountry: 'ZA' },
                offers: PRICING_TIERS.filter((tier) => tier.price > 0)
                    .map((tier) => ({
                        '@type': 'Offer',
                        name: `Mendr ${tier.name}`,
                        price: String(tier.price),
                        priceCurrency: 'ZAR',
                        priceSpecification: {
                            '@type': 'UnitPriceSpecification',
                            price: String(tier.price),
                            priceCurrency: 'ZAR',
                            unitCode: 'MON',
                            valueAddedTaxIncluded: true,
                        },
                        description: tier.tagline,
                    }))
                    .concat([
                        {
                            '@type': 'Offer',
                            name: 'Mendr Verified',
                            price: String(VERIFIED_ADD_ON.price),
                            priceCurrency: 'ZAR',
                            priceSpecification: {
                                '@type': 'UnitPriceSpecification',
                                price: String(VERIFIED_ADD_ON.price),
                                priceCurrency: 'ZAR',
                                unitCode: 'MON',
                                valueAddedTaxIncluded: true,
                            },
                            description: VERIFIED_ADD_ON.tagline,
                        },
                    ]),
            },
            {
                '@type': 'FAQPage',
                mainEntity: PRICING_FAQS.map((faq) => ({
                    '@type': 'Question',
                    name: faq.q,
                    acceptedAnswer: { '@type': 'Answer', text: faq.a },
                })),
            },
        ],
    };
}

function TierCard({ tier }: { tier: PricingTier }) {
    return (
        <div
            className={cn(
                'relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-7',
                tier.featured
                    ? 'border-foreground/40 shadow-md ring-1 ring-foreground/10'
                    : 'border-border/60'
            )}
        >
            {tier.featured && tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="px-3 py-1 text-xs font-medium tracking-wide">{tier.badge}</Badge>
                </div>
            )}

            <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                <span className="text-sm text-muted-foreground">— {tier.label}</span>
            </div>

            <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                    {formatRand(tier.price)}
                </span>
                <span className="text-sm text-muted-foreground">{tier.price === 0 ? 'forever' : '/ month'}</span>
            </div>

            {tier.annualPrice && tier.annualSaving ? (
                <p className="mt-1 text-xs text-muted-foreground">
                    Or {formatRand(tier.annualPrice)} / year — save {formatRand(tier.annualSaving)} on annual
                </p>
            ) : (
                <p className="mt-1 text-xs text-muted-foreground">VAT incl. — no card required</p>
            )}

            <p className="mt-3 text-sm font-medium text-foreground">{tier.tagline}</p>

            <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between gap-3">
                    <dt>Best for</dt>
                    <dd className="text-right text-foreground/80">{tier.bestFor}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt>Lead allowance</dt>
                    <dd className="text-right text-foreground/80">{tier.leadCap}</dd>
                </div>
            </dl>

            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {tier.included.map((item) => (
                    <li key={item} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" />
                        <span className="text-foreground/85">{item}</span>
                    </li>
                ))}
            </ul>

            <Button asChild className="mt-6 w-full" variant={tier.featured ? 'default' : 'secondary'}>
                <Link href={tier.ctaHref}>{tier.ctaLabel}</Link>
            </Button>
        </div>
    );
}

export default function PricingPage() {
    const base = getSiteUrl();
    const jsonLd = buildPricingJsonLd(base);

    // Order: highlight Pro on mobile (Most Popular first) per accessibility requirement.
    const tiersForMobile = [...PRICING_TIERS].sort((a, b) => Number(b.featured) - Number(a.featured));

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <a
                href="#hero"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
            >
                Skip to content
            </a>

            <LandingHeader
                navLinks={[
                    { href: '/contractors#how-it-works', label: 'How It Works' },
                    { href: '/contractors#value', label: 'Why Join' },
                    { href: '/pricing', label: 'Pricing' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/', label: 'For Homeowners' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/contractors"
                logoBadge={<Badge variant="secondary">Pro</Badge>}
                mobileCtaHref="/contractors/network"
                mobileCtaLabel="Join The Network"
            />

            <main className="flex-1">
                {/* Hero */}
                <section id="hero" className="relative overflow-hidden">
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
                    <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
                        <Badge variant="secondary" className="mb-4">
                            Founding phase — free for all contractors
                        </Badge>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                            Simple, Honest Pricing
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                            A flat monthly subscription, no commission on jobs, ever. Free during the founding phase —
                            paid plans roll out once volume is stable across the Western Cape, with at least thirty days’ written notice.
                        </p>
                        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Button asChild size="lg">
                                <Link href="/contractors/network">Apply To Join The Network</Link>
                            </Button>
                            <Button asChild variant="ghost" className="h-10 text-sm">
                                <Link href="#tiers">View Tiers</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Founding-phase callout */}
                <section className="px-4 pb-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-5xl rounded-2xl border border-foreground/20 bg-foreground/[0.03] p-6 sm:p-8">
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
                            Currently free for all contractors
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-foreground sm:text-2xl">
                            You do not need to pay anything today.
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
                            Listing, leads, reviews, profile — everything in the table below is unlocked at no cost
                            during the founding phase. The prices listed show the planned tier structure for when paid
                            plans launch. Founding contractors will be given the option to opt in, not charged
                            automatically.
                        </p>
                    </div>
                </section>

                {/* Pricing grid */}
                <section id="tiers" className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                    <div className="mx-auto max-w-7xl">
                        <div className="mb-8 text-center">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                Four Tiers. One Honest Promise.
                            </h2>
                            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                                Subscriptions anchored to what SA SMEs already pay for Xero or Sage. No per-lead
                                charges. No commission on jobs done through Mendr. Prices VAT inclusive.
                            </p>
                        </div>

                        {/* Mobile: Most Popular first */}
                        <div className="grid gap-5 sm:hidden">
                            {tiersForMobile.map((tier) => (
                                <TierCard key={tier.name} tier={tier} />
                            ))}
                        </div>

                        {/* Tablet / desktop: canonical order Free → Business */}
                        <div className="hidden gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-4">
                            {PRICING_TIERS.map((tier) => (
                                <TierCard key={tier.name} tier={tier} />
                            ))}
                        </div>

                        {/* Verified add-on */}
                        <div className="mt-10 rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
                            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
                                <div className="max-w-2xl">
                                    <div className="flex items-baseline gap-3">
                                        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                                            Mendr Verified
                                        </h3>
                                        <Badge variant="outline">Add-on</Badge>
                                    </div>
                                    <p className="mt-2 text-sm text-foreground/80 sm:text-base">
                                        {VERIFIED_ADD_ON.tagline}
                                    </p>
                                    <p className="mt-2 text-sm text-muted-foreground">{VERIFIED_ADD_ON.description}</p>
                                    <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                        {VERIFIED_ADD_ON.included.map((item) => (
                                            <li key={item} className="flex gap-2.5">
                                                <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" />
                                                <span className="text-foreground/85">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="flex flex-col items-start gap-3 lg:items-end">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-bold text-foreground sm:text-4xl">
                                            +{formatRand(VERIFIED_ADD_ON.price)}
                                        </span>
                                        <span className="text-sm text-muted-foreground">/ month</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Attaches to any paid tier</p>
                                    <Button asChild>
                                        <Link href={VERIFIED_ADD_ON.ctaHref}>{VERIFIED_ADD_ON.ctaLabel}</Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section id="faq" className="bg-foreground/[0.02] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto max-w-3xl">
                        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            Honest Answers To The Common Questions
                        </h2>
                        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
                            Pricing is the bit we get asked about most. Here is exactly how it works.
                        </p>
                        <div className="mt-10 space-y-3">
                            {PRICING_FAQS.map((faq, idx) => (
                                <details
                                    key={faq.q}
                                    className="group rounded-xl border border-border/60 bg-card p-5 transition-colors open:border-foreground/30 open:bg-foreground/[0.02]"
                                    {...(idx === 0 ? { open: true } : {})}
                                >
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-foreground">
                                        <span>{faq.q}</span>
                                        <span
                                            aria-hidden="true"
                                            className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 text-xs text-muted-foreground transition-transform group-open:rotate-45"
                                        >
                                            +
                                        </span>
                                    </summary>
                                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="bg-foreground px-4 py-16 text-background sm:px-6 sm:py-20 lg:px-8">
                    <div className="mx-auto max-w-3xl text-center">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                            Free To Apply. No Commission. Ever.
                        </h2>
                        <p className="mt-3 text-base text-background/70 sm:text-lg">
                            Join the founding network of Western Cape contractors. Pricing starts when you choose
                            it to.
                        </p>
                        <div className="mt-7">
                            <Button asChild size="lg" className="bg-background font-medium text-foreground hover:bg-background/90">
                                <Link href="/contractors/network">Apply To Join The Network</Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-border/50 bg-background py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr]">
                        <div>
                            <p className="text-base font-semibold text-foreground">Mendr</p>
                            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                                Built in Cape Town. For the Western Cape. Lead generation and operational tooling
                                for the contractors who keep homes running.
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                Explore
                            </p>
                            <nav className="mt-3 flex flex-col gap-2">
                                {(
                                    [
                                        ['How It Works', '/contractors#how-it-works'],
                                        ['Why Join', '/contractors#value'],
                                        ['Pricing', '/pricing'],
                                        ['FAQ', '#faq'],
                                    ] as [string, string][]
                                ).map(([label, href]) => (
                                    <Link
                                        key={`${label}-${href}`}
                                        href={href}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                Mendr
                            </p>
                            <nav className="mt-3 flex flex-col gap-2">
                                {(
                                    [
                                        ['For Homeowners', '/'],
                                        ['Contact', '/contact'],
                                        ['Privacy Policy', '/privacy'],
                                        ['Terms Of Service', '/terms'],
                                    ] as [string, string][]
                                ).map(([label, href]) => (
                                    <Link
                                        key={`${label}-${href}`}
                                        href={href}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                    </div>
                    <div className="mt-10 border-t border-border/50 pt-6">
                        <p className="text-sm text-muted-foreground">
                            &copy; {new Date().getFullYear()} Mendr. All Rights Reserved. Prices VAT inclusive.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
