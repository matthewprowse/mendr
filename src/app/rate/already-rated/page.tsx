import { Button } from '@/components/ui/button';

export const metadata = {
    title: 'Already rated | Mendr',
    robots: { index: false, follow: false },
};

export default function RateAlreadyRatedPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
            <h1 className="mb-2 text-xl font-bold text-gray-900">You&rsquo;ve already rated this</h1>
            <p className="mb-8 text-sm text-muted-foreground">
                Your feedback has already been recorded — thanks for taking the time.
            </p>
            <Button variant="outline" asChild>
                <a href="/">Go to Mendr</a>
            </Button>
        </div>
    );
}
