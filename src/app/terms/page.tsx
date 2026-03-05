import type { Metadata } from 'next';
import { fetchLegalDocument } from '@/lib/fetch-legal-document';
import { LegalDocumentView } from '@/components/legal-document-view';
import { LandingHeader } from '@/components/landing-header';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Terms and conditions for using Scandio home maintenance diagnosis and provider discovery.',
};

export default async function TermsPage() {
    const doc = await fetchLegalDocument('terms_of_service');

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/', label: 'Home' },
                    { href: '/pro', label: 'For Pros' },
                    { href: '/privacy', label: 'Privacy' },
                    { href: '/terms', label: 'Terms' },
                ]}
                showTrades={false}
            />

            <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
                {doc ? (
                    <LegalDocumentView content={doc.content} />
                ) : (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-6 text-center">
                        <h1 className="text-2xl font-bold tracking-tight mb-4">
                            Terms of Service
                        </h1>
                        <p className="text-base text-muted-foreground">
                            Our terms of service are being prepared. Please check
                            back soon.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
