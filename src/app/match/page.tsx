import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import MatchLoading from './loading';

const MatchPageClient = dynamic(() => import('./client'), {
    loading: () => <MatchLoading />,
});

export const metadata: Metadata = {
    title: 'Find providers',
    description:
        'Match with local home maintenance providers based on your Scandio diagnosis.',
};

export default function MatchIndexPage() {
    return <MatchPageClient />;
}
