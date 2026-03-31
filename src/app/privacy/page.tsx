import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'How Scandio handles your information.',
};

export default function PrivacyPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'For Homeowners' },
                    { href: '/pro/join', label: 'For Contractors' },
                ]}
                logoHref="/"
                showTrades={false}
            />
            <main className="flex-1">
                <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Privacy Policy
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">Last updated March 2026.</p>
                    <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
                        <p>
                            This page is a placeholder summary. Scandio is committed to protecting
                            your privacy. We process data only as needed to provide the service
                            (for example, photos you submit for diagnosis and messages you send
                            through our contact form).
                        </p>
                        <p>
                            For full details, retention, cookies, and your rights, we will publish
                            a complete policy here. Until then, contact us with any privacy
                            questions.
                        </p>
                        <p>
                            <Link href="/contact" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                                Contact us
                            </Link>
                        </p>
                    </div>
                </article>
            </main>
        </div>
    );
}
