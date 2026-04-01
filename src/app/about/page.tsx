import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'For Homeowners' },
                    { href: '/pro/join', label: 'For Providers' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            About Scandio
                        </h1>
                        <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
                            Scandio was founded by Matthew Prowse in late 2025 to solve a practical
                            problem many homeowners experience: low clarity before the first provider
                            call. The platform evolved from a provider-discovery concept into a
                            diagnosis-first workflow designed to improve homeowner confidence and
                            provider-side lead quality.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-6 md:grid-cols-2">
                        <div className="rounded-xl border border-border/50 bg-card p-6">
                            <h2 className="text-lg font-semibold text-foreground">Founder Background</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                Matthew&apos;s work is shaped by an Information Systems perspective and
                                ongoing BCIS honours research. The central principle is simple:
                                better context in leads to better decisions out. That principle drives
                                the way Scandio handles diagnosis clarity, provider matching, and
                                real-world usability.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-card p-6">
                            <h2 className="text-lg font-semibold text-foreground">How The Idea Started</h2>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                The idea came from repeated frustrations in the local home maintenance
                                workflow: unclear issues, inconsistent recommendations, and too much
                                back-and-forth before useful work can even begin. Scandio focuses on
                                reducing that friction for both sides of the market.
                            </p>
                        </div>
                    </div>

                    <section className="mt-8 rounded-xl border border-border/50 bg-card p-6">
                        <h2 className="text-lg font-semibold text-foreground">Timeline</h2>
                        <div className="relative mt-5 space-y-5 pl-7">
                            <div className="absolute left-2.5 top-0 h-full w-px bg-border/80" />
                            {[
                                ['September 2025', 'Scandio founded with an initial provider-discovery concept.'],
                                ['Late 2025', 'Product direction shifted toward diagnosis-first homeowner workflows.'],
                                ['Early 2026', 'Matching quality and report clarity became core priorities.'],
                                ['Current', 'Platform is being refined through product research and real usage feedback.'],
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
                            <Link href="/welcome">Generate Free Scandio Report</Link>
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    );
}
