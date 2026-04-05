import type { Metadata } from 'next';
import ProJoinPageClient from './pro-join-page-client';

export const metadata: Metadata = {
    title: 'For contractors',
    description: 'Join the Scandio provider network and receive informed homeowner enquiries.',
};

export default function ProJoinPage() {
    return <ProJoinPageClient />;
}
