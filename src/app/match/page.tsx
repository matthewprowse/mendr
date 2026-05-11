import dynamic from 'next/dynamic';
import { META_MATCH_INDEX } from '@/lib/site-metadata';
import MatchLoading from './loading';

const MatchPageClient = dynamic(() => import('./client'), {
    loading: () => <MatchLoading />,
});

export const metadata = META_MATCH_INDEX;

export default function MatchIndexPage() {
    return <MatchPageClient />;
}
