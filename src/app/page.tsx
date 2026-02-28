import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { LandingHeader } from '@/components/landing-header';
import { Placeholder } from '@/components/placeholder';
import { TestimonialsSection } from '@/app/page/_components/testimonials-section';
import { StartDiagnosisButton } from '@/app/page/_components/start-diagnosis-button';
import { getServices } from '@/lib/fetch-services';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
    title: 'Scandio: Home Maintenance Assistant',
    description: '',
    keywords: [],
    openGraph: {
        title: 'Scandio: Home Maintenance Assistant',
        description: '',
    },
};

const PLACEHOLDER_DESC =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.';

function getServiceChatHref(label: string): string {
    const id = crypto.randomUUID();
    const params = new URLSearchParams({ trade: label });
    return `/chat/${id}?${params.toString()}`;
}

function FeaturesChatPlaceholder({
    label,
    aspectRatio = 'aspect-video',
    className = '',
    title = '',
    description = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
}: {
    label: string;
    aspectRatio?: string;
    className?: string;
    title?: string;
    description?: string;
}) {
    const aspectClass =
        aspectRatio === 'aspect-[4/3]'
            ? 'lg:aspect-[4/3]'
            : aspectRatio === 'aspect-[21/9]'
              ? 'lg:aspect-[21/9]'
              : 'lg:aspect-video';

    return (
        <div
            className={`flex flex-col rounded-lg border border-border/50 bg-secondary/50 transition-all duration-250 hover:border-border/75 hover:bg-secondary/25 max-lg:aspect-auto max-lg:min-h-[300px] ${aspectClass} ${className}`}
        >
            <div className="flex flex-1 min-h-0 items-center justify-center">
                <span className="px-2 text-center text-sm text-muted-foreground">
                    {title || label}
                </span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 rounded-b-lg border-t border-border/50 bg-white p-4">
                {title && <p className="text-sm font-medium text-foreground">{title}</p>}
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

export default async function LandingPage() {
    const services = await getServices();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#features', label: 'Features' },
                    { href: '#all-services', label: 'Services' },

                    { href: '/pro', label: 'For Pros' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                {/* Hero Section (Split Layout) */}
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

                {/* Trust / Social Proof Bar */}
                <section className="bg-muted/50 py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-4 lg:px-6">
                        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:grid-rows-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <div
                                    key={i}
                                    className="flex h-24 items-center justify-center rounded-lg border border-border/50 hover:border-border/75 transition-all duration-250 bg-white text-center text-sm text-muted-foreground"
                                >
                                    Contractor Logo
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How It Works (Alternating Z-Pattern) */}
                <section
                    id="how-it-works"
                    className="mx-auto max-w-7xl space-y-12 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 scroll-mt-16"
                >
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            How Scandio Works
                        </h2>
                        <p className="mx-auto mt-4 max-w-4xl text-muted-foreground">
                            We have transformed the search for home maintenance contractors into a
                            streamlined, professional process. Scandio analyses your image,
                            identifies your respective fault and returns a diagnosis and resolution
                            summary, linking you directly to the best local contractors in the
                            Western Cape.
                        </p>
                    </div>

                    {/* Row 1: Left text, Right visual */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div className="space-y-2 order-2 lg:order-1">
                            <h3 className="text-xl font-semibold">Step 1. Capture Fault</h3>
                            <p className="text-base text-muted-foreground">
                                Capture your maintenance issue with a photo. Scandio identifies the
                                respective fault and analyses the symptoms in real-time to provide
                                an accurate and professional starting point for your repair.
                            </p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <Placeholder
                                label="Capture Fault Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Row 2: Right text, Left visual */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div>
                            <Placeholder
                                label="Generate Scandio Report Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold">
                                Step 2. Generate Scandio Report
                            </h3>
                            <p className="text-base text-muted-foreground">
                                Within seconds, you will receive an expert-level home repair
                                analysis. You will also receive a secure Scandio Report outlining
                                the details from your diagnosis, readily available to share with
                                your chosen contractors to assist in a prompt resolution.
                            </p>
                        </div>
                    </div>

                    {/* Row 3: Left text, Right visual */}
                    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
                        <div className="space-y-2 order-2 lg:order-1">
                            <h3 className="text-xl font-semibold">
                                Step 3. Connect with Local Contractors
                            </h3>
                            <p className="text-base text-muted-foreground">
                                You can choose to contact the contractors directly, or send them our
                                prepared WhatsApp summary of our conversation. You choose which
                                contractor in your area receives your Scandio Report, ensuring they
                                arrive informed and ready to fix the issue on the first visit.
                            </p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <Placeholder
                                label="Connect with Local Contractors Mockup"
                                aspectRatio="aspect-[4/3]"
                                className="w-full"
                            />
                        </div>
                    </div>
                </section>

                {/* Bento Box UI Showcase */}
                <section id="features" className="bg-muted/50 py-16 scroll-mt-16">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mb-12 text-center">
                            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                                Our Features
                            </h2>
                            <p className="mx-auto mt-4 max-w-4xl text-muted-foreground">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad
                                minim veniam, quis nostrud exercitation ullamco laboris.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:grid-rows-3 lg:gap-6">
                            {/* Large hero card - spans 2 cols, 2 rows on lg only */}
                            <div className="min-h-[200px] lg:col-span-2 lg:row-span-2 lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="Secure Scandio Report"
                                    aspectRatio="aspect-[4/3]"
                                    className="h-full min-h-[200px] w-full"
                                    title="Secure Scandio Report"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                            {/* Top right - 2 small cards */}
                            <div className="min-h-[180px] lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="[PLACEHOLDER: Cost Estimate UI]"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Data Privacy"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                            <div className="min-h-[180px] lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="[PLACEHOLDER: Repair Report Card]"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Cost Estimates"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                            {/* Wide card - spans 2 cols on lg */}
                            <div className="min-h-[160px] lg:col-span-2 lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="[PLACEHOLDER: Provider List / Match UI]"
                                    aspectRatio="aspect-[21/9]"
                                    className="h-full min-h-[160px] w-full"
                                    title="Estimated Fault Diagnosis"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                            {/* Bottom row - 2 medium cards */}
                            <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="[PLACEHOLDER: Share Report]"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Local Contractors"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                            <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                                <FeaturesChatPlaceholder
                                    label="[PLACEHOLDER: Local Specialists]"
                                    aspectRatio="aspect-video"
                                    className="h-full min-h-[180px] w-full"
                                    title="Easy Communication with Contractors"
                                    description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam."
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* All Services */}
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
                                    <p className="text-sm text-muted-foreground">
                                        {PLACEHOLDER_DESC}
                                    </p>
                                    <div className="mt-4 flex flex-1 flex-col justify-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                        <Button asChild variant="secondary" size="sm" className="w-fit">
                                            <Link href={getServiceChatHref(label)}>
                                                Start Diagnosis
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <TestimonialsSection />
            </main>

            <LandingFooter showLargeBrandText />
        </div>
    );
}
