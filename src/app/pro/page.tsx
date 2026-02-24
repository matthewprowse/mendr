import type { Metadata } from 'next';
import Link from 'next/link';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';
import { LandingFooter } from '@/components/landing-footer';
import { LandingHeader } from '@/components/landing-header';
import { CoverageMap } from '@/app/page/_components/coverage-map';
import { FeaturesSection } from './_components/features-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { ProSignupSection } from './_components/pro-signup-section';
import { TestimonialsSection } from './_components/testimonials-section';

export const metadata: Metadata = {
    title: 'Scandio Pro',
    description:
        '',
    keywords: [
    ],
    openGraph: {
        title: 'Scandio Pro',
        description:
            '',
    },
};

export default function ProLandingPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#coverage', label: 'Coverage' },
                    { href: '#features', label: 'Features' },
                ]}
                logoHref="/pro"
                showProBadge
            />

            <main className="flex-1">
                {/* Hero Section (Split Layout) */}
                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
                            <div className="flex flex-col gap-4 w-full">
                                <div className="h-9 bg-secondary w-full rounded-md" />
                                <div className="h-9 bg-secondary w-full rounded-md" />
                            </div>
                            <p className="text-base text-muted-foreground">
                                Stop buying dead leads. Western Cape contractors tired of call-out
                                fees and vague complaints. We send you homeowners who already know
                                what&apos;s wrong—and what parts you need—before you drive.
                                <br />
                                <br />
                                Skip the uncertainty, get pre-diagnosed jobs, and connect with
                                homeowners who are ready to hire.
                            </p>
                            <div className="flex flex-col items-center gap-3 lg:items-start">
                                <Button>
                                    <Link href="#register">Join Network</Link>
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    No Credit Card Required
                                </p>
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

                {/* Contractors / Trust Bar */}
                <section className="bg-muted/50 py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-4 lg:px-6">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:grid-rows-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <div
                                    key={i}
                                    className="flex h-24 items-center justify-center rounded-lg border border-border/50 bg-white hover:border-border/75 transition-all duration-250 text-center text-sm text-muted-foreground"
                                >
                                    Contractor Logo
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Coverage Map */}
                <section
                    id="coverage"
                    className="mx-auto max-w-7xl flex flex-col gap-12 px-4 py-16 sm:px-6 sm:py-28 lg:px-8"
                >
                    <div className="flex flex-col gap-4 text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Service Coverage
                        </h2>
                        <p className="mx-auto max-w-3xl text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad
                            minim veniam, quis nostrud exercitation ullamco laboris.
                        </p>
                    </div>
                    {process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
                    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ? (
                        <CoverageMap
                            apiKey={
                                process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
                                process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
                                ''
                            }
                        />
                    ) : (
                        <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-border/50 bg-secondary/75 hover:border-border/75 hover:bg-secondary/50 transition-all duration-250 text-sm text-muted-foreground p-4 text-center">
                            Configure NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY or
                            NEXT_PUBLIC_GOOGLE_PLACES_API_KEY to Show Map.
                        </div>
                    )}
                </section>

                <HowItWorksSection />

                <FeaturesSection />

                {/* Stats — By the numbers */}
                <section className="py-16 sm:py-24">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 flex flex-col items-center gap-4">
                            <div className="flex w-full max-w-md flex-col gap-4">
                                <div className="h-9 w-full rounded-md bg-secondary" />
                                <div className="h-9 w-full rounded-md bg-secondary" />
                            </div>
                            <p className="mx-auto max-w-3xl text-center text-muted-foreground">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad
                                minim veniam, quis nostrud exercitation ullamco laboris.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-6">
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Homeowners in Western Cape"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Average Job Value"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Upfront Lead Costs"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Avg. Lead Response"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Leads with AI Diagnosis"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                <Placeholder
                                    label="Call-Out Fees"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[120px] w-full"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <TestimonialsSection />

                {/* Join Network / Signup */}
                <section className="bg-muted/20">
                    <ProSignupSection />
                </section>
            </main>

            <LandingFooter showLargeBrandText />
        </div>
    );
}
