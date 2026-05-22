import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Button } from '@/components/ui/button';

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'For Homeowners' },
                    { href: '/contractors', label: 'For Providers' },
                    { href: '/about', label: 'About' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <section className="relative overflow-hidden">
                    <div
                        className="pointer-events-none absolute inset-0"
                        aria-hidden="true"
                        style={{
                            backgroundImage:
                                'radial-gradient(circle, var(--foreground) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                            opacity: 0.027,
                        }}
                    />
                    <div className="relative mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
                        <div className="w-full rounded-2xl border border-border/50 bg-card p-8 text-center sm:p-10">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Error 404
                            </p>
                            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                                This Page Could Not Be Found
                            </h1>
                            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                                The page may have moved, the link may be outdated, or the content is no
                                longer available. You can return to the homeowner page, start a diagnosis,
                                or explore the provider side.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Button asChild>
                                    <Link href="/">Go To Home</Link>
                                </Button>
                                <Button variant="secondary" asChild>
                                    <Link href="/start">Generate Free Mendr Report</Link>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <Link href="/contractors">For Providers</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
