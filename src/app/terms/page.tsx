import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Terms for using Scandio.',
};

export default function TermsPage() {
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
                        Terms of Service
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">Last updated March 2026.</p>
                    <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
                        <p>
                            This page is a placeholder. By using Scandio you agree to use the
                            service responsibly. AI-generated reports are informational and are not a
                            substitute for a qualified on-site inspection by a licensed
                            professional where required.
                        </p>
                        <p>
                            Formal terms of use, limitations of liability, and dispute resolution will
                            be published here. Questions in the meantime?{' '}
                            <Link href="/contact" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                                Contact us
                            </Link>
                            .
                        </p>
                    </div>
                </article>
            </main>
        </div>
    );
}
