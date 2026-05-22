import { Button } from '@/components/ui/button';

export const metadata = {
    title: 'Invalid link | Mendr',
    robots: { index: false, follow: false },
};

export default function RateInvalidPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
            <h1 className="mb-2 text-xl font-bold text-gray-900">This link isn&rsquo;t valid</h1>
            <p className="mb-8 text-sm text-muted-foreground">
                The rating link may have expired or already been used.
            </p>
            <Button variant="outline" asChild>
                <a href="/">Go to Mendr</a>
            </Button>
        </div>
    );
}
