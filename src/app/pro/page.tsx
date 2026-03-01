import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { LandingHeader } from '@/components/landing-header';
import { ProSignupSection } from './_components/pro-signup-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { FeaturesSection } from './_components/features-section';
import { TestimonialsSection } from './_components/testimonials-section';

export const metadata: Metadata = {
    title: 'For Pros | Scandio',
    description: 'Join the Scandio network. Get pre-diagnosed leads and grow your trade business.',
};

export default function ProPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/pro', label: 'For Pros' },
                    { href: '/', label: 'Homeowners' },
                    { href: '/privacy', label: 'Privacy' },
                    { href: '/terms', label: 'Terms' },
                    { href: '/pro/terms', label: 'Pro Terms' },
                ]}
                logoHref="/pro"
                showProBadge
                showCustomerLink
                showTrades={false}
            />

            <main className="flex-1">
                <section className="border-b border-border/50 bg-muted/30 py-16 sm:py-24">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                            For service professionals
                        </h1>
                        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                            Get pre-diagnosed leads from homeowners in your area. Join the Scandio network and grow your business.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                            <Link
                                href="#signup"
                                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                            >
                                Join as a Pro
                            </Link>
                            <Link
                                href="/"
                                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                I&apos;m a homeowner
                            </Link>
                        </div>
                    </div>
                </section>

                <HowItWorksSection />
                <FeaturesSection />
                <TestimonialsSection />
                <section id="signup" className="scroll-mt-16">
                    <ProSignupSection />
                </section>
            </main>

            <LandingFooter />
        </div>
    );
}
