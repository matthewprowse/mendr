import type { Metadata } from 'next';
import ApplicationEditClient from './client';

export const metadata: Metadata = {
    title: 'Review your Scandio profile',
    description: 'Review and edit your Scandio contractor profile summary before it goes live.',
    robots: { index: false, follow: false },
};

export default function ApplicationEditPage() {
    return <ApplicationEditClient />;
}
