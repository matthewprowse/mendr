import { META_START } from '@/lib/site-metadata';
import { StartPageClient } from './client';

export const metadata = META_START;

export default function StartPage() {
    return <StartPageClient />;
}
