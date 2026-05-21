import type { Metadata } from 'next';
import { ReportPageContent } from './components/report-page-content';

export const metadata: Metadata = {
    title: 'Report a Provider | Menda',
    description: 'Search for and report a provider to help us keep our platform safe.',
};

export default function ReportPage() {
    return <ReportPageContent />;
}
