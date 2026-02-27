import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ProNotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 bg-background">
            <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
                The provider or page you’re looking for doesn’t exist or couldn’t be loaded.
            </p>
            <Button variant="secondary" asChild>
                <Link href="/">Back to home</Link>
            </Button>
        </div>
    );
}
