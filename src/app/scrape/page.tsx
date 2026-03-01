import type { Metadata } from 'next';
import { ScrapePageClient } from './_components/scrape-page-client';

export const metadata: Metadata = {
    title: 'Scrape providers | Scandio',
    description: 'Pre-populate provider cache by area and trade.',
};

export default function ScrapePage() {
    return <ScrapePageClient />;
}
