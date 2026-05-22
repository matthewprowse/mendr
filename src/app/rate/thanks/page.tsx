import { Suspense } from 'react';
import { RateThanksClient } from './client';

export const metadata = {
    title: 'Thanks for your rating | Mendr',
    robots: { index: false, follow: false },
};

export default function RateThanksPage() {
    return (
        <Suspense>
            <RateThanksClient />
        </Suspense>
    );
}
