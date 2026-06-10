import Link from 'next/link';
import { TRADES } from '@/app/page/components/content';

/**
 * "What we cover" — six service categories Mendr diagnoses. Server-rendered for
 * SEO (each card is keyword surface). Cards link to the diagnosis entry point.
 */
export function HomeMarketingTrades() {
    return (
        <section id="trades" className="scroll-mt-16 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What Mendr Covers</h2>
                    <p className="mt-3 text-base text-muted-foreground">
                        Six categories of home fault. One report tells you which to act on first.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TRADES.map((trade) => (
                        <Link
                            key={trade.name}
                            href="/start"
                            className="group flex flex-col rounded-xl border border-border/50 bg-background p-5 transition-colors hover:border-foreground"
                        >
                            <h3 className="text-base font-semibold text-foreground sm:text-lg">{trade.name}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{trade.descriptor}</p>
                            <ul className="mt-4 space-y-1.5 border-t border-border/50 pt-4 text-sm text-muted-foreground">
                                {trade.examples.map((ex) => (
                                    <li key={ex} className="flex items-baseline gap-2">
                                        <span aria-hidden="true" className="text-muted-foreground/60">
                                            &rarr;
                                        </span>
                                        <span>{ex}</span>
                                    </li>
                                ))}
                            </ul>
                        </Link>
                    ))}
                </div>

                <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
                    Mendr&rsquo;s diagnosis is a starting point, not a final verdict. Every report includes a
                    confidence note and a reminder that a site inspection is still needed.
                </p>
            </div>
        </section>
    );
}
