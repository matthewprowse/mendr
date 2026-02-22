'use client';

const EXAMPLE_SERVICES = [
    {
        title: 'Best Electricians Near Me',
        subtitle: 'Find licensed electricians for repairs, rewires, and installations.',
        trade: 'Electrician',
    },
    {
        title: 'Top Plumbers Nearby',
        subtitle: 'Fixing leaks, blocked drains, and boiler issues in your area.',
        trade: 'Plumber',
    },
    {
        title: 'Gate Repair Specialists',
        subtitle: 'Automatic gates, hinges, motors, and access control repairs.',
        trade: 'Gate Repair',
    },
    {
        title: 'Roofing & Guttering Experts',
        subtitle: 'Roof repairs, replacements, gutter clearing, and fascia work.',
        trade: 'Roofing',
    },
] as const;

export function WelcomeState({
    onUploadClick,
    onServiceSelect,
}: {
    onUploadClick?: () => void;
    onServiceSelect?: (trade: string, diagnosis: string) => void;
}) {
    return (
        <main className="flex-1 overflow-y-auto pb-36">
            <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-foreground">
                        Stop Guessing. Start Diagnosing.
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Upload a photo below and we&apos;ll diagnose the issue and find local specialists for you.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXAMPLE_SERVICES.map(({ title, subtitle, trade }, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() =>
                                onServiceSelect ? onServiceSelect(trade, title) : onUploadClick?.()
                            }
                            className="rounded-md border border-input flex flex-col p-4 flex flex-col gap-1 text-left hover:bg-muted/30 transition-colors"
                        >
                            <span className="text-sm font-medium text-foreground">{title}</span>
                            <span className="text-sm text-muted-foreground leading-relaxed">
                                {subtitle}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </main>
    );
}
