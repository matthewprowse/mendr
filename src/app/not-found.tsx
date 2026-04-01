import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col bg-background">
            <AppHeader showBack />
            <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-10">
                <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Error 404
                    </p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                        This page could not be found
                    </h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        The page you requested may have moved, the link may be outdated, or the provider
                        profile is no longer available.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        <Button asChild>
                            <Link href="/">Go to home</Link>
                        </Button>
                        <Button variant="secondary" asChild>
                            <Link href="/chat/new">Start a scan</Link>
                        </Button>
                    </div>
                </div>
            </section>
        </main>
    );
}
