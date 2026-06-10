import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing-header';
import { Button } from '@/components/ui/button';
import { getSiteUrl } from '@/lib/site-url';

export async function generateMetadata(): Promise<Metadata> {
    const base = getSiteUrl();
    return {
        title: 'About Mendr — Home Fault Diagnosis for Western Cape Homeowners',
        description:
            'Mendr was built to give Western Cape homeowners a clearer picture of home maintenance faults before the first provider call. Founded 2025 in Cape Town.',
        alternates: {
            canonical: `${base}/about`,
        },
        openGraph: {
            title: 'About Mendr',
            description:
                'Built in Cape Town to reduce uncertainty in home maintenance. Learn about the problem Mendr was designed to solve.',
            type: 'website',
            url: `${base}/about`,
            locale: 'en_ZA',
        },
    };
}

export default function AboutPage() {
    const base = getSiteUrl();
    const personJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'Matthew Prowse',
        jobTitle: 'Founder',
        worksFor: {
            '@type': 'Organization',
            name: 'Mendr',
            url: base,
        },
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'Cape Town',
            addressCountry: 'ZA',
        },
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'For Homeowners' },
                    { href: '/pro', label: 'For Providers' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Why Mendr Exists
                        </h1>
                        <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
                            Most homeowners hit the same wall: something breaks, they do not know what
                            it is, they call a provider, and the conversation starts from zero.
                            <br />
                            <br />
                            Mendr was built to change that. Matthew Prowse founded it in Cape Town in
                            late 2025 after running into the same problem. The hardest part of home
                            repair is not the repair. It is knowing what you are dealing with before it
                            starts.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-6 md:grid-cols-2">
                        <div className="rounded-xl border border-border/50 bg-card p-6">
                            <h2 className="text-lg font-semibold text-foreground">Founder Background</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                Matthew studied Information Systems and is completing his BCIS honours.
                                His research looks at how people make decisions when information is
                                incomplete — which is the exact problem Mendr was built to address.
                                He lives and works in Cape Town.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-card p-6">
                            <h2 className="text-lg font-semibold text-foreground">How The Idea Started</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                The idea came from a simple frustration: calling a plumber without
                                knowing what to say, getting three different answers, and still not
                                understanding what was wrong.
                                <br />
                                <br />
                                Mendr does not fix that. It gives you the starting point that makes
                                the rest easier.
                            </p>
                        </div>
                    </div>

                    <section className="mt-8 rounded-xl border border-border/50 bg-card p-6">
                        <h2 className="text-lg font-semibold text-foreground">Timeline</h2>
                        <div className="relative mt-5 space-y-5 pl-7">
                            <div className="absolute left-2.5 top-0 h-full w-px bg-border/80" />
                            {[
                                ['September 2025', 'Mendr founded with an initial provider-discovery concept.'],
                                ['Late 2025', 'Product direction shifted toward diagnosis-first homeowner workflows.'],
                                ['Early 2026', 'Matching quality and report clarity became core priorities.'],
                                [
                                    '2026',
                                    'Mendr is live across the Western Cape. Fault coverage and provider matching continue to expand based on real homeowner usage.',
                                ],
                            ].map(([date, text]) => (
                                <div key={date} className="relative">
                                    <div className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-foreground" />
                                    <p className="text-sm font-semibold text-foreground">{date}</p>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="mt-10 text-center">
                        <Button asChild size="lg">
                            <Link href="/start">Generate Free Mendr Report</Link>
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    );
}
