import type { Metadata } from 'next';
import MatchPageClient from './match-page-client';

export const metadata: Metadata = {
    title: 'Find providers',
    description:
        'Match with local home maintenance providers based on your Scandio diagnosis.',
};

export default function MatchIndexPage() {
    return <MatchPageClient />;
}
