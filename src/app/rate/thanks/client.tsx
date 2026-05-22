'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

const STAR_LABELS: Record<number, string> = {
    1: 'Sorry to hear that.',
    2: 'Thanks for letting us know.',
    3: 'Good to know.',
    4: 'Great to hear!',
    5: 'Fantastic — glad it worked out!',
};

export function RateThanksClient() {
    const params = useSearchParams();
    const rating = Number(params.get('rating'));
    const message = STAR_LABELS[rating] ?? 'Thanks for your feedback.';
    const stars = rating >= 1 && rating <= 5 ? rating : 0;

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
            <div className="mb-4 text-4xl">
                {'★'.repeat(stars)}{'☆'.repeat(Math.max(0, 5 - stars))}
            </div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">Rating submitted</h1>
            <p className="mb-1 text-sm text-muted-foreground">{message}</p>
            <p className="mb-8 text-sm text-muted-foreground">
                Your feedback helps other homeowners find great contractors on Mendr.
            </p>
            <Button asChild>
                <a href="/start">Start a new diagnosis</a>
            </Button>
        </div>
    );
}
