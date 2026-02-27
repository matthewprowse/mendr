import type { Metadata } from 'next';
import { ProvidersListClient } from './_components/providers-list-client';
import { tradeToServiceLabel } from '@/lib/services';

export const metadata: Metadata = {
    title: 'View Providers',
    description: 'Find local service providers near you.',
};

type PageProps = { searchParams: Promise<{ trade?: string }> };

export default async function ProvidersPage({ searchParams }: PageProps) {
    const { trade: rawTrade } = await searchParams;
    const trade = rawTrade?.trim()
        ? (tradeToServiceLabel(rawTrade) ?? rawTrade)
        : null;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <ProvidersListClient initialTrade={trade} />
        </div>
    );
}
