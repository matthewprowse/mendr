import type { Metadata } from 'next';

import Diagnosis2PageClient from './client';

export const metadata: Metadata = {
    title: 'Diagnosis 2',
    description: 'Mock diagnosis UI for editing.',
};

export default function Diagnosis2Page() {
    return <Diagnosis2PageClient />;
}

