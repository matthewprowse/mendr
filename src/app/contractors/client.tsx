'use client';

import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { CheckCircle, XCircle } from '@phosphor-icons/react';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const HOW_IT_WORKS = [
    {
        title: 'Apply To Join The Network',
        body: 'Submit your company details, service categories, and operating area. We review each application to keep network quality high and match quality stable.',
        label: 'Provider application form mockup',
    },
    {
        title: 'Build Your Profile',
        body: 'Set up your profile with service details, credentials, proof of work, and contact information. Better profile quality improves trust and increases conversion on homeowner-side comparisons.',
        label: 'Provider profile setup mockup',
    },
    {
        title: 'Receive Informed Enquiries',
        body: 'Homeowners arrive with diagnosis context already structured, so first conversations start with better information. That reduces wasted quoting cycles and helps teams arrive better prepared.',
        label: 'Informed homeowner enquiry mockup',
    },
];

const VALUE_BENTO = [
    { title: 'Higher Intent Enquiries', body: 'Homeowners come in after diagnosis, not cold browsing.', span: 'lg:col-span-2' },
    { title: 'Less Wasted Quoting', body: 'Report-first conversations reduce repetitive clarifications.', span: 'lg:col-span-2' },
    { title: 'Better First Visits', body: 'Teams can prepare with stronger context before arriving.', span: 'lg:col-span-1' },
    { title: 'Zero Commission Model', body: 'Menda does not take a cut of completed jobs.', span: 'lg:col-span-1' },
    { title: 'Visibility In Your Area', body: 'Recommendations factor service fit and geographic relevance.', span: 'lg:col-span-1' },
    { title: 'Profile-Led Trust', body: 'Structured profiles help homeowners choose with confidence.', span: 'lg:col-span-1' },
    { title: 'Sustainable Growth', body: 'As diagnosis volume grows, qualified lead volume compounds.', span: 'lg:col-span-2' },
    { title: 'Built For Long-Term Quality', body: 'Matching and ranking logic is continuously refined from real usage feedback.', span: 'lg:col-span-2' },
];

const FAQS = [
    {
        q: 'Is it free to join right now?',
        a: 'Yes. Joining during the founding phase is completely free. There is no application fee, no monthly subscription cost during onboarding, and Menda does not take commission on any jobs you complete through the platform. This founding period is how we build a high-quality provider network before rolling out paid plans. Providers who join now lock in favourable terms and are given advance notice before any pricing changes take effect, with no automatic billing surprises.',
    },
    {
        q: 'What kind of enquiries will we actually receive?',
        a: 'Enquiries through Menda come from homeowners who have already been through a structured AI diagnosis of their problem. That means when a homeowner contacts you, they can typically tell you what the likely fault is, roughly how urgent it is, and what they have already observed — rather than just saying "something is broken." In practice this reduces the back-and-forth that usually happens before a site visit. You spend less time clarifying the problem and more time quoting and doing the work. The enquiry quality is meaningfully different from a generic directory listing or cold lead.',
    },
    {
        q: 'How does Menda decide which providers to recommend?',
        a: 'Recommendations are produced by a composite ranking algorithm that weighs four signals: service relevance (how closely your trade and specialisation match the diagnosed problem), your Bayesian-smoothed rating (which prevents a handful of five-star reviews from inflating a sparse profile), geographic proximity to the homeowner, and recent activity. No single signal dominates. A highly-rated provider who is 12 km away may rank above a closer provider with fewer reviews and a weaker specialisation match. Profile completeness also adds a small but meaningful boost — providers with photos, a detailed bio, and listed specialisations consistently perform better in matching.',
    },
    {
        q: 'Can we control which areas and trades we appear in?',
        a: 'Yes, and this is one of the most important parts of your profile to get right. Your operating area and service categories are the primary inputs to how matching calculates relevance. If you set your radius to cover Cape Town\'s southern suburbs, you will not appear in recommendations for homeowners in the northern suburbs. If your trade is set to Electrical with a specialisation in DB board upgrades, a homeowner diagnosed with a gate motor fault is unlikely to see you — which is the intended behaviour. Setting these accurately means the enquiries you receive are genuinely within your operational scope, which reduces wasted call-outs.',
    },
    {
        q: 'Do we need to use Menda\'s pricing or quoting tools?',
        a: 'No. Menda does not have a built-in quoting tool and has no interest in sitting between you and your pricing process. The platform is focused entirely on diagnosis context and qualified matching. Once a homeowner contacts you through Menda, everything from that point — how you quote, how you invoice, how you communicate — is handled entirely through your own existing process. You keep full commercial control over every job.',
    },
    {
        q: 'What happens if a homeowner\'s diagnosis turns out to be wrong?',
        a: 'Menda\'s AI diagnosis is an informed starting point, not a guaranteed assessment. Homeowners are shown a confidence score alongside every diagnosis, and are reminded that a site assessment is needed before any work is confirmed. In practice, this means your team arrives with a reasonable hypothesis about the fault rather than a blank slate — but you still do the professional assessment on-site. If the actual problem differs from the diagnosis, that is a normal part of the trade and is fully expected. The diagnosis is there to improve the quality of the first conversation, not to replace your expertise.',
    },
    {
        q: 'How does profile quality affect how often we are shown?',
        a: 'Profile completeness directly influences your ranking score and how homeowners perceive you when comparing providers side by side. A profile with verified work photos, a well-written bio, specific trade specialisations, and a good volume of genuine reviews consistently outperforms a sparse profile with the same rating. Homeowners see your profile summary, highlights, and review snapshot when choosing who to contact — a detailed profile gives them the confidence to reach out rather than scroll past. Profile quality is not a one-off setup; it compounds over time as reviews accumulate and your specialisations become more specific.',
    },
    {
        q: 'When do paid plans start and how much notice will we get?',
        a: 'Paid plans are planned for later in 2025, once the platform has a stable homeowner base and consistent enquiry volume. Founding providers will receive a minimum of 30 days\' written notice before any billing begins, and will be given the option to select a plan or opt out before any charges are made. There will be no automatic upgrade from the free founding tier to a paid plan — it will always require your explicit confirmation. The plan tiers and pricing are shown below so you know exactly what to expect.',
    },
    {
        q: 'Is Menda available outside Cape Town?',
        a: 'Cape Town is where Menda launched and where the founding provider network is being built. Geographic expansion is planned but will follow homeowner demand — the platform will open new areas once there is enough volume in a region to make provider matching meaningful. If your business operates in another South African city or region, you are welcome to apply now and we will notify you as coverage expands to your area.',
    },
    {
        q: 'How do we get started?',
        a: 'Click the "Apply To Join The Network" button on this page. The application takes around five minutes and covers your business details, trade categories, and operating area. Once reviewed and approved — typically within a few business days — you will receive a link to complete your full profile setup, including photos, specialisations, and credentials. After that, you are live in the matching system and will begin appearing in relevant homeowner recommendations.',
    },
];

const PRICING_TIERS = [
    {
        name: 'Starter',
        price: 'R249',
        period: '/month',
        description: 'Everything you need to get listed and start receiving informed homeowner enquiries in your area.',
        cta: 'Apply For Free',
        ctaHref: '/contractors/network',
        highlighted: false,
        features: [
            { label: 'Profile listing in Menda matching', included: true },
            { label: 'Service category and area matching', included: true },
            { label: 'Up to 30 homeowner enquiries per month', included: true },
            { label: 'AI-generated bio from your profile data', included: true },
            { label: 'Work photo gallery (up to 10 photos)', included: true },
            { label: 'Review aggregation and display', included: true },
            { label: 'Basic match analytics (views, clicks)', included: true },
            { label: 'Priority placement in results', included: false },
            { label: 'Highlighted "Recommended" badge', included: false },
            { label: 'Extended service areas (up to 3 zones)', included: false },
            { label: 'Advanced analytics and enquiry trends', included: false },
            { label: 'Dedicated account support', included: false },
        ],
    },
    {
        name: 'Professional',
        price: 'R649',
        period: '/month',
        description: 'For established businesses ready to grow volume and stand out in a competitive service area.',
        cta: 'Apply For Free',
        ctaHref: '/contractors/network',
        highlighted: true,
        badge: 'Most Popular',
        features: [
            { label: 'Everything in Starter', included: true },
            { label: 'Up to 100 homeowner enquiries per month', included: true },
            { label: 'Priority placement in search results', included: true },
            { label: 'Highlighted "Recommended" badge on profile', included: true },
            { label: 'Work photo gallery (up to 40 photos)', included: true },
            { label: 'Extended service areas (up to 3 zones)', included: true },
            { label: 'AI-generated specialisation highlights', included: true },
            { label: 'Advanced analytics and enquiry trends', included: true },
            { label: 'WhatsApp enquiry routing', included: true },
            { label: 'Unlimited enquiries per month', included: false },
            { label: 'Featured placement above standard results', included: false },
            { label: 'Dedicated account support', included: false },
        ],
    },
    {
        name: 'Premium',
        price: 'R1 249',
        period: '/month',
        description: 'Maximum visibility and unlimited capacity for high-volume businesses operating across multiple areas.',
        cta: 'Apply For Free',
        ctaHref: '/contractors/network',
        highlighted: false,
        features: [
            { label: 'Everything in Professional', included: true },
            { label: 'Unlimited homeowner enquiries per month', included: true },
            { label: 'Featured placement above all standard results', included: true },
            { label: 'Up to 6 service zone coverage areas', included: true },
            { label: 'Unlimited work photo gallery', included: true },
            { label: 'Multi-trade profile support', included: true },
            { label: 'Full enquiry history and conversion analytics', included: true },
            { label: 'Early access to new Menda features', included: true },
            { label: 'Dedicated account support and onboarding', included: true },
            { label: 'Custom profile highlights and positioning', included: true },
            { label: 'Priority review verification', included: true },
            { label: 'Co-marketing in homeowner communications', included: true },
        ],
    },
] as const;

const SOCIAL_LINKS = [
    { href: 'https://x.com/', label: 'X', icon: Twitter }, // Twitter icon kept for brand consistency
    { href: 'https://www.linkedin.com/', label: 'LinkedIn', icon: Linkedin },
    { href: 'https://www.instagram.com/', label: 'Instagram', icon: Instagram },
    { href: 'https://www.facebook.com/', label: 'Facebook', icon: Facebook },
] as const;

export default function ProJoinPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#value', label: 'Why Join' },
                    { href: '#pricing', label: 'Pricing' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/', label: 'For Homeowners' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/contractors"
                showTrades={false}
                logoBadge={<Badge variant="secondary">Pro</Badge>}
                mobileCtaHref="/contractors/network"
                mobileCtaLabel="Apply To Join The Network"
            />

            <main className="flex-1">
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle, var(--foreground) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.027 }} />
                    <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
                        <div className="grid items-center gap-12 lg:grid-cols-[3fr_2fr]">
                            <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
                                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                                    Less Time Quoting. More Time Doing The Work.
                                </h1>
                                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                                    Join a network where homeowners arrive with structured diagnosis context already in hand. Better inputs produce better enquiries and better conversion.
                                </p>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <Button asChild size="lg">
                                        <Link href="/contractors/network">Apply To Join The Network</Link>
                                    </Button>
                                    <Button variant="ghost" className="h-10 text-sm" asChild>
                                        <Link href="#how-it-works">How Menda Works</Link>
                                    </Button>
                                </div>
                                <p className="text-sm text-muted-foreground">Free To Join · No Commission · Founding Network</p>
                            </div>
                            <div className="mx-auto w-full max-w-[360px]">
                                <Placeholder label="" aspectRatio="aspect-[9/16]" className="w-full rounded-xl" />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-foreground py-14 sm:py-20">
                    <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                        <p className="text-2xl font-semibold text-background sm:text-3xl">
                            Most providers waste time on enquiries with poor context.
                        </p>
                        <p className="mt-3 text-base text-background/80 sm:text-lg">
                            Menda improves enquiry quality by moving diagnosis clarity earlier in the workflow.
                        </p>
                        <p className="mt-3 text-base text-background sm:text-lg">
                            Better homeowner context means better provider efficiency.
                        </p>
                    </div>
                </section>

                <section id="how-it-works" className="scroll-mt-16 py-16 sm:py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How Menda Works For Providers</h2>
                            <p className="mt-3 text-base text-muted-foreground">
                                A cleaner workflow from application to informed enquiry.
                            </p>
                        </div>
                        <div className="space-y-14 sm:space-y-16">
                            {HOW_IT_WORKS.map(({ title, body, label }, idx) => (
                                <div key={title} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
                                    <div className={idx % 2 === 1 ? 'order-2 lg:order-1' : 'order-2'}>
                                        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h3>
                                        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
                                    </div>
                                    <div className={idx % 2 === 1 ? 'order-1 lg:order-2' : 'order-1'}>
                                        <Placeholder label={label} aspectRatio="aspect-[4/3]" className="w-full rounded-lg" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="value" className="scroll-mt-16 bg-muted/30 py-16 sm:py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why Providers Join Menda</h2>
                            <p className="mt-3 text-base text-muted-foreground">
                                Menda is built to improve lead quality, reduce friction, and help providers convert more efficiently.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                            {VALUE_BENTO.map((item) => (
                                <div key={item.title} className={['rounded-xl border border-border/50 bg-background p-4 sm:p-5 flex flex-col', item.span].join(' ')}>
                                    <div className="mb-3 overflow-hidden rounded-lg bg-secondary/50">
                                        <Placeholder label="" aspectRatio="aspect-video" className="w-full" />
                                    </div>
                                    <h3 className="text-base font-semibold text-foreground sm:text-lg">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground flex-1">{item.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Pricing ─────────────────────────────────────────────────────── */}
                <section id="pricing" className="scroll-mt-16 py-16 sm:py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Simple, Transparent Pricing</h2>
                            <p className="mt-3 text-base text-muted-foreground">
                                Join for free during the founding phase. Paid plans begin later in 2025. Founding providers receive 30 days&apos; notice before billing starts.
                            </p>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-3">
                            {PRICING_TIERS.map((tier) => (
                                <div
                                    key={tier.name}
                                    className={[
                                        'relative flex flex-col rounded-2xl border p-6 sm:p-8',
                                        tier.highlighted
                                            ? 'border-foreground bg-foreground text-background shadow-xl'
                                            : 'border-border/60 bg-background',
                                    ].join(' ')}
                                >
                                    {'badge' in tier && tier.badge && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background ring-2 ring-background">
                                            {tier.badge}
                                        </span>
                                    )}
                                    <div className="mb-6">
                                        <p className={['text-sm font-semibold uppercase tracking-wider', tier.highlighted ? 'text-background/60' : 'text-muted-foreground'].join(' ')}>
                                            {tier.name}
                                        </p>
                                        <div className="mt-2 flex items-end gap-1">
                                            <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                                            <span className={['mb-1 text-sm', tier.highlighted ? 'text-background/60' : 'text-muted-foreground'].join(' ')}>{tier.period}</span>
                                        </div>
                                        <p className={['mt-3 text-sm leading-relaxed', tier.highlighted ? 'text-background/75' : 'text-muted-foreground'].join(' ')}>
                                            {tier.description}
                                        </p>
                                    </div>
                                    <ul className="mb-8 flex-1 space-y-3">
                                        {tier.features.map((feature) => (
                                            <li key={feature.label} className="flex items-start gap-3">
                                                {feature.included ? (
                                                    <CheckCircle
                                                        weight="fill"
                                                        className={['mt-0.5 h-4 w-4 shrink-0', tier.highlighted ? 'text-background' : 'text-foreground'].join(' ')}
                                                    />
                                                ) : (
                                                    <XCircle
                                                        weight="regular"
                                                        className={['mt-0.5 h-4 w-4 shrink-0', tier.highlighted ? 'text-background/30' : 'text-muted-foreground/30'].join(' ')}
                                                    />
                                                )}
                                                <span className={[
                                                    'text-sm',
                                                    feature.included
                                                        ? tier.highlighted ? 'text-background' : 'text-foreground'
                                                        : tier.highlighted ? 'text-background/40' : 'text-muted-foreground/50',
                                                ].join(' ')}>
                                                    {feature.label}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <Button
                                        asChild
                                        size="lg"
                                        className={tier.highlighted ? 'bg-background text-foreground hover:bg-background/90' : ''}
                                        variant={tier.highlighted ? 'default' : 'outline'}
                                    >
                                        <Link href={tier.ctaHref}>{tier.cta}</Link>
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <p className="mt-8 text-center text-sm text-muted-foreground">
                            All plans are free during the founding phase. No credit card required to join.
                        </p>
                    </div>
                </section>

                <section id="faq" className="scroll-mt-16 py-16 sm:py-20">
                    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-10 text-center sm:mb-12">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently Asked Questions</h2>
                        </div>
                        <div className="mx-auto divide-y divide-border/50">
                            {FAQS.map(({ q, a }) => (
                                <details key={q} className="group py-4">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                                        <h3 className="text-base font-semibold text-foreground">{q}</h3>
                                        <span className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                                    </summary>
                                    <p className="mt-3 pb-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="bg-[#0D0D0D] py-20 sm:py-24">
                    <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
                        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Join The Network And Start Receiving Informed Enquiries.
                        </h2>
                        <p className="mt-3 text-base text-white/70">
                            Free To Join. No Commission. Built For Provider Efficiency.
                        </p>
                        <div className="mt-6">
                            <Button asChild size="lg" className="bg-white font-medium text-black hover:bg-white/90">
                                <Link href="/contractors/network">Apply To Join The Network</Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-border/50 bg-background py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr]">
                        <div>
                            <p className="text-base font-semibold text-foreground">Menda</p>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                Provider-focused matching and diagnosis context to reduce wasted quoting and improve conversion quality.
                            </p>
                            <div className="mt-4 flex items-center gap-2">
                                {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
                                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground">
                                        <Icon className="h-4 w-4" />
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</p>
                            <nav className="mt-3 flex flex-col gap-2">
                                {([['How It Works', '#how-it-works'], ['Why Join', '#value'], ['Pricing', '#pricing'], ['FAQ', '#faq']] as [string, string][]).map(([label, href]) => (
                                    <Link key={`${label}-${href}`} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                        {label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
                            <nav className="mt-3 flex flex-col gap-2">
                                {([['For Homeowners', '/'], ['Contact', '/contact'], ['Privacy Policy', '/privacy'], ['Terms Of Service', '/terms']] as [string, string][]).map(([label, href]) => (
                                    <Link key={`${label}-${href}`} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                        {label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                    </div>
                    <div className="mt-10 border-t border-border/50 pt-6">
                        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Menda. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
