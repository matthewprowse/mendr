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
                {/* Hero: same as customer landing page */}
                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
                            <h3 className="text-base text-muted-foreground font-medium">
                                Sophisticated Systems, Spimplified Solutions.
                            </h3>
                            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-4xl">
                                Western Cape&apos;s New Standard in Home Maintenance
                            </h1>
                            <p className="text-base text-muted-foreground">
                                Your home didn&apos;t come with a manual, and home maintenance shouldn&apos;t
                                be a guessing game. Scandio diagnoses faults instantly and generates
                                a secure, professional Scandio Report for you to own and share with
                                a provider of your choice.
                                <br />
                                <br />
                                Skip the uncertainty, gain instant clarity on costs, and connect
                                with local specialists to resolve your repairs faster and more
                                accurately.
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                                <Link
                                    href="#signup"
                                    className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                                >
                                    Join the Scandio Network
                                </Link>
                                <Link
                                    href="/"
                                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                                >
                                    I&apos;m a homeowner
                                </Link>
                            </div>
                        </div>
                        <div className="flex justify-center">
                            <div className="relative w-full max-w-[348px] overflow-hidden rounded-3xl border border-border/50 bg-secondary/50 hover:bg-secondary/25 transition-all duration-250">
                                <div className="aspect-[9/16] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                                    Scandio Report Mockup
                                </div>
                            </div>
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
