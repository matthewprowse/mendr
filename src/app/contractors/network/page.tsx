import { META_CONTRACTORS_ONBOARD } from '@/lib/site-metadata';
import ProOnboardPageClient from './client';

export const metadata = META_CONTRACTORS_ONBOARD;

export default function ProOnboardPage() {
    return <ProOnboardPageClient />;
}
