import type { Metadata } from 'next';
import { fetchLegalDocument } from '@/lib/fetch-legal-document';
import { LegalDocumentView } from '@/components/legal-document-view';
import { LandingFooter } from '@/components/landing-footer';
import { LandingHeader } from '@/components/landing-header';

export const metadata: Metadata = {
    title: 'Pro Terms of Service',
    description: 'Terms for service professionals joining the Scandio network.',
};

export default async function ProTermsPage() {
    const doc = await fetchLegalDocument('pro_terms_of_service');

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

            <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
                {doc ? (
                    <LegalDocumentView content={doc.content} />
                ) : (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-6 text-center">
                        <h1 className="text-2xl font-bold tracking-tight mb-4">
                            Pro Terms of Service
                        </h1>
                        <p className="text-base text-muted-foreground">
                            Our Pro terms are being prepared. Please check back
                            soon.
                        </p>
                    </div>
                )}
            </main>

            <LandingFooter />
        </div>
    );
}
