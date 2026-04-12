import type { Metadata } from 'next';
import Match2PageClient from './client';

export const metadata: Metadata = {
    title: 'Match 2',
    description: 'Match experience preview with demo providers (same UI as provider matches).',
};

export default function Match2Page() {
    return <Match2PageClient />;
}
