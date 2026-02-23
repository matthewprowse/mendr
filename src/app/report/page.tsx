import type { Metadata } from 'next';
import { ReportPageContent } from './_components/report-page-content';

export const metadata: Metadata = {
    title: 'Report a Provider | Scandio',
    description: 'Search for and report a provider to help us keep our platform safe.',
};

export default function ReportPage() {
    return <ReportPageContent />;
}
