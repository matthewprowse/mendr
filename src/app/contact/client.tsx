'use client';

import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { ContactForm } from '@/components/contact-form';

export default function ContactPageClient() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'For Homeowners' },
                    { href: '/contractors', label: 'For Contractors' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
                    <div className="mb-10 flex flex-col gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Got a question?
                        </h1>
                        <p className="text-base text-muted-foreground">
                            Whether you are a homeowner, a contractor, or just curious about how
                            Scandio works — we would love to hear from you.
                        </p>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-muted/20 p-6 sm:p-8">
                        <ContactForm fieldIdPrefix="contact" subjectMode="input" />
                    </div>
                </section>
            </main>

            <footer className="border-t border-border/50 bg-background py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                            &copy; {new Date().getFullYear()} Scandio. All Rights Reserved.
                        </p>
                        <nav className="flex gap-4">
                            <Link
                                href="/"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                For Homeowners
                            </Link>
                            <Link
                                href="/contractors"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                For Contractors
                            </Link>
                        </nav>
                    </div>
                </div>
            </footer>
        </div>
    );
}
