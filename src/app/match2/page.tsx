import type { Metadata } from 'next';
import Match2PageClient from './client';

export const metadata: Metadata = {
    title: 'Match 2',
    description: 'Mock provider match UI for iterative redesign.',
};

export default function Match2Page() {
    return <Match2PageClient />;
}
