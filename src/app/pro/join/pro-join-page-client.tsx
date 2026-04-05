'use client';

import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
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
    { title: 'Zero Commission Model', body: 'Scandio does not take a cut of completed jobs.', span: 'lg:col-span-1' },
    { title: 'Visibility In Your Area', body: 'Recommendations factor service fit and geographic relevance.', span: 'lg:col-span-1' },
    { title: 'Profile-Led Trust', body: 'Structured profiles help homeowners choose with confidence.', span: 'lg:col-span-1' },
    { title: 'Sustainable Growth', body: 'As diagnosis volume grows, qualified lead volume compounds.', span: 'lg:col-span-2' },
    { title: 'Built For Long-Term Quality', body: 'Matching and ranking logic is continuously refined from real usage feedback.', span: 'lg:col-span-2' },
];

const FAQS = [
    {
        q: 'Is it free to join right now?',
        a: 'Yes. The founding phase is free to join. Scandio does not take commission on jobs completed through your business.',
    },
    {
        q: 'What type of leads should we expect?',
        a: 'Scandio is designed to send informed homeowner enquiries where diagnosis context is already available. This improves first-contact quality compared with generic cold enquiries.',
    },
    {
        q: 'How are providers recommended to homeowners?',
        a: 'Recommendations are based on service relevance, local fit, and profile quality signals. We use layered ranking rather than a single filter.',
    },
    {
        q: 'Can we control where we are shown?',
        a: 'Yes. Operating area and service categories are core inputs in recommendation relevance, so matching aligns with your practical service radius.',
    },
    {
        q: 'Do we need to use Scandio pricing tools?',
        a: 'No. You keep control of your own quoting and pricing process. Scandio focuses on diagnosis context and qualified matching.',
    },
    {
        q: 'What does profile quality affect?',
        a: 'Profile completeness improves homeowner trust, click-through behaviour, and downstream contact quality.',
    },
    {
        q: 'When do paid plans begin?',
        a: 'Paid plan timelines are communicated in advance. Founding providers are informed before any pricing changes take effect.',
    },
    {
        q: 'How do we get started?',
        a: 'Use the application flow on this page. Once approved, you can complete profile setup and begin receiving informed enquiries.',
    },
];

const SOCIAL_LINKS = [
    { href: 'https://x.com/', label: 'X', icon: Twitter },
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
                    { href: '#faq', label: 'FAQ' },
                    { href: '/', label: 'For Homeowners' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/pro/join"
                showTrades={false}
                logoBadge={<Badge variant="secondary">Pro</Badge>}
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
                                        <Link href="/pro/onboard">Apply To Join The Network</Link>
                                    </Button>
                                    <Button variant="ghost" className="h-10 text-sm" asChild>
                                        <Link href="#how-it-works">How Scandio Works</Link>
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
                            Scandio improves enquiry quality by moving diagnosis clarity earlier in the workflow.
                        </p>
                        <p className="mt-3 text-base text-background sm:text-lg">
                            Better homeowner context means better provider efficiency.
                        </p>
                    </div>
                </section>

                <section id="how-it-works" className="scroll-mt-16 py-16 sm:py-20">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How Scandio Works For Providers</h2>
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
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why Providers Join Scandio</h2>
                            <p className="mt-3 text-base text-muted-foreground">
                                Scandio is built to improve lead quality, reduce friction, and help providers convert more efficiently.
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
                                <Link href="/pro/onboard">Apply To Join The Network</Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-border/50 bg-background py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-10 lg:grid-cols-[2fr_1fr_1fr]">
                        <div>
                            <p className="text-base font-semibold text-foreground">Scandio</p>
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
                                {([['How It Works', '#how-it-works'], ['Why Join', '#value'], ['FAQ', '#faq']] as [string, string][]).map(([label, href]) => (
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
                        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Scandio. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
