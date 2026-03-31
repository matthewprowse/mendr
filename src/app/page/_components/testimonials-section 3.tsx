import { Card } from '@/components/ui/card';

const TESTIMONIALS = [
    {
        quote:
            'I uploaded a photo of my leaking tap and got a clear diagnosis plus a list of local pros. The report made it easy to compare quotes.',
        name: 'Amelia',
        location: 'Cape Town',
    },
    {
        quote:
            'The Scandio Report felt professional and actionable. I sent it to a contractor and the fix happened faster than expected.',
        name: 'Theo',
        location: 'Stellenbosch',
    },
    {
        quote:
            'Quick, secure, and surprisingly accurate. I didn’t have to explain the problem from scratch — the report did that for me.',
        name: 'Nadia',
        location: 'Somerset West',
    },
];

export function TestimonialsSection() {
    return (
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What Customers Say</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
                    Home maintenance is stressful. Scandio turns uncertainty into clarity with a secure report you can share.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {TESTIMONIALS.map((t) => (
                    <Card
                        key={t.name}
                        className="h-full rounded-xl border-border/50 bg-secondary/20 px-6 py-8 shadow-none"
                    >
                        <p className="text-sm leading-relaxed text-foreground">{t.quote}</p>
                        <div className="mt-6">
                            <p className="text-sm font-semibold text-foreground">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.location}</p>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

