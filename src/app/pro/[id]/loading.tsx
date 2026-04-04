import { AppHeader } from '@/components/app-header';

function SkeletonBlock({ className }: { className: string }) {
    return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function ProProviderLoading() {
    return (
        <main className="flex min-h-screen flex-col bg-background">
            <AppHeader showBack />

            <section className="w-full border-b border-border bg-background">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-3">
                    <SkeletonBlock className="h-56 w-full rounded-xl" />

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div className="space-y-2">
                                <SkeletonBlock className="h-8 w-64" />
                                <SkeletonBlock className="h-4 w-48" />
                                <SkeletonBlock className="h-3 w-72" />
                                <div className="flex gap-2 pt-1">
                                    <SkeletonBlock className="h-4 w-20" />
                                    <SkeletonBlock className="h-4 w-24" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <SkeletonBlock className="h-7 w-28 rounded-full" />
                                <SkeletonBlock className="h-7 w-24 rounded-full" />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <SkeletonBlock className="h-6 w-24 rounded-full" />
                            <SkeletonBlock className="h-6 w-28 rounded-full" />
                            <SkeletonBlock className="h-6 w-20 rounded-full" />
                            <SkeletonBlock className="h-6 w-32 rounded-full" />
                        </div>
                    </div>
                </div>
            </section>

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-24">
                <section className="space-y-4">
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="h-4 w-full" />
                    <SkeletonBlock className="h-4 w-[92%]" />
                    <SkeletonBlock className="h-4 w-[84%]" />
                    <div className="flex flex-wrap gap-2 pt-2">
                        <SkeletonBlock className="h-6 w-24 rounded-full" />
                        <SkeletonBlock className="h-6 w-20 rounded-full" />
                        <SkeletonBlock className="h-6 w-28 rounded-full" />
                    </div>
                </section>

                <section className="space-y-4">
                    <SkeletonBlock className="h-3 w-44" />
                    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                        <div className="space-y-2">
                            <SkeletonBlock className="h-4 w-24" />
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <SkeletonBlock className="h-4 w-20" />
                                    <SkeletonBlock className="h-4 w-28" />
                                </div>
                            ))}
                        </div>
                        <SkeletonBlock className="h-48 w-full rounded-xl" />
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <SkeletonBlock className="h-3 w-16" />
                        <SkeletonBlock className="h-6 w-28 rounded-full" />
                    </div>
                    <SkeletonBlock className="h-3 w-36" />
                    <SkeletonBlock className="h-4 w-full" />
                    <SkeletonBlock className="h-4 w-[95%]" />
                    <SkeletonBlock className="h-4 w-[88%]" />
                    <div className="grid gap-3 md:grid-cols-2">
                        <SkeletonBlock className="h-36 w-full rounded-xl" />
                        <SkeletonBlock className="h-36 w-full rounded-xl" />
                    </div>
                </section>

                <section className="rounded-xl border border-border bg-background p-4 md:p-6">
                    <SkeletonBlock className="h-3 w-48" />
                    <SkeletonBlock className="mt-3 h-4 w-full" />
                    <SkeletonBlock className="mt-2 h-4 w-[90%]" />
                    <SkeletonBlock className="mt-4 h-9 w-44 rounded-full" />
                </section>

                <section className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div className="space-y-3">
                        <SkeletonBlock className="h-3 w-14" />
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <SkeletonBlock key={i} className="aspect-square w-full rounded-xl" />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                        <SkeletonBlock className="h-3 w-44" />
                        <SkeletonBlock className="h-4 w-full" />
                        <SkeletonBlock className="h-4 w-[92%]" />
                        <SkeletonBlock className="h-4 w-[84%]" />
                        <SkeletonBlock className="h-9 w-56 rounded-full" />
                    </div>
                </section>
            </div>
        </main>
    );
}
