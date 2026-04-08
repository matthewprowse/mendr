import type { Metadata } from 'next';
import { FlowStepHeader } from '@/components/flow-header';
import { getSiteLegalConfig } from '@/lib/site-legal';
import { TermsPageContent } from './content';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Terms for using Scandio in South Africa.',
};

export default function TermsPage() {
    const c = getSiteLegalConfig();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={1} onBack={null} backHref="/" centerLabel="Terms" />
            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 pb-16 pt-20 sm:px-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-semibold text-foreground">Terms of Service</h1>
                    <p className="text-sm text-muted-foreground">Last updated 5 April 2026.</p>
                </div>
                <TermsPageContent c={c} />
            </main>
        </div>
    );
}
