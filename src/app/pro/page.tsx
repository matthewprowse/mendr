import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LandingHeader } from '@/components/landing-header';
import { StartDiagnosisButton } from '@/app/page/_components/start-diagnosis-button';
import { Placeholder } from '@/components/placeholder';
import { getServices } from '@/lib/fetch-services';
import { Button } from '@/components/ui/button';
import { ProSignupSection } from './_components/pro-signup-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { FeaturesSection } from './_components/features-section';
import { TestimonialsSection } from './_components/testimonials-section';

export const metadata: Metadata = {
    title: 'For Pros | Scandio',
    description: 'Join the Scandio network. Get pre-diagnosed leads and grow your trade business.',
};

const PLACEHOLDER_DESC =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.';

function getServiceChatHref(label: string): string {
    const id = crypto.randomUUID();
    const params = new URLSearchParams({ trade: label });
    return `/chat/${id}?${params.toString()}`;
}

/** Renders the services grid; used inside Suspense so the rest of the page can show immediately. */
async function ServicesSection() {
    const services = await getServices();
    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(({ id, label }) => (
                <div
                    key={id}
                    className="flex flex-col overflow-hidden rounded-lg border border-border/50 bg-background transition-all duration-250 hover:border-border hover:bg-background"
                >
                    <Placeholder
                        label={label}
                        aspectRatio="aspect-[16/9]"
                        className="w-full shrink-0 rounded-b-none border-0"
                    />
                    <div className="flex flex-1 flex-col gap-1.5 border-t border-border/50 bg-white p-4">
                        <h3 className="font-semibold text-foreground">{label}</h3>
                        <p className="text-sm text-muted-foreground">{PLACEHOLDER_DESC}</p>
                        <div className="mt-4 flex flex-1 flex-col justify-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <Button asChild variant="secondary" size="sm" className="w-fit">
                                <Link href={getServiceChatHref(label)}>Start Diagnosis</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ServicesSectionFallback() {
    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="flex flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/50 animate-pulse"
                >
                    <div className="aspect-video w-full bg-muted" />
                    <div className="flex flex-1 flex-col gap-1.5 border-t border-border/50 p-4">
                        <div className="h-5 w-2/3 rounded bg-muted" />
                        <div className="h-4 w-full rounded bg-muted" />
                        <div className="mt-4 h-9 w-24 rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ProPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#features', label: 'Features' },
                    { href: '#all-services', label: 'Services' },
                    { href: '#testimonials', label: 'Testimonials' },
                    { href: '#signup', label: 'Join Network' },
                    { href: '/', label: 'For Customers' },
                ]}
                logoHref="/pro"
                showProBadge
                showTrades={false}
                showAppShortcut={false}
                showAuthControls={false}
            />

            <main className="flex-1">
                {/* Customer landing hero reused on Pro page */}
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
                            <StartDiagnosisButton className="text-sm">
                                Generate Free Scandio Report
                            </StartDiagnosisButton>
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
                {/* All Services — streamed so the page shell shows immediately */}
                <section
                    id="all-services"
                    className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 scroll-mt-16"
                >
                    <div className="mb-12 text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Our Services
                        </h2>
                        <p className="mx-auto mt-4 max-w-4xl text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
                            tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
                            veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
                            commodo consequat.
                        </p>
                    </div>
                    <Suspense fallback={<ServicesSectionFallback />}>
                        <ServicesSection />
                    </Suspense>
                </section>
                <section id="testimonials" className="scroll-mt-16">
                    <TestimonialsSection />
                </section>
                <section id="signup" className="scroll-mt-16">
                    <ProSignupSection />
                </section>
            </main>
        </div>
    );
}
