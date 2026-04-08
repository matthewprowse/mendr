import type { Metadata } from 'next';
import DiagnosisPageClient from './client';

export const metadata: Metadata = {
    title: 'Diagnosis',
    description:
        'Review your home maintenance diagnosis on Scandio and continue to find a specialist.',
};

export default function DiagnosisIndexPage() {
    return <DiagnosisPageClient />;
}
