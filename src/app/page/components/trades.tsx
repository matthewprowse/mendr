'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { TRADES } from '@/app/page/components/content';
import {
    SectionHeader,
    Reveal,
    Stagger,
    StaggerItem,
    SectionFrame,
    CornerBrackets,
} from '@/app/page/components/_primitives';

/**
 * "What we cover" — six trade cards. Corner brackets + hover lift.
 * Each card is an SEO doorway to its trade landing page.
 */
export function HomeMarketingTrades() {
    return (
        <SectionFrame id="trades" tone="muted">
            <Reveal>
                <SectionHeader
                    eyebrowIndex="03"
                    eyebrowLabel="What we cover"
                    eyebrowMeta="6 categories · Western Cape"
                    title={<>Six categories of home fault. One report covers all of them.</>}
                    lede="If your problem spans more than one trade, the report will tell you which one to call first."
                />
            </Reveal>

            <Stagger className="mt-14 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
                {TRADES.map((trade, idx) => {
                    const Icon = trade.icon;
                    return (
                        <StaggerItem key={trade.slug}>
                            <Link
                                href={`/diagnose/${trade.slug}`}
                                className="group relative flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-7 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-foreground"
                            >
                                <CornerBrackets className="absolute inset-2 opacity-0 transition-opacity group-hover:opacity-100" />

                                <div className="flex items-start justify-between">
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                        {String(idx + 1).padStart(2, '0')} / 06
                                    </span>
                                    <ArrowUpRight
                                        className="size-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                                        strokeWidth={2}
                                    />
                                </div>

                                <Icon
                                    className="size-7 text-foreground transition-transform duration-300 group-hover:scale-105"
                                    strokeWidth={1.5}
                                />

                                <div className="space-y-2">
                                    <h3 className="text-xl font-semibold leading-snug text-foreground">
                                        {trade.name}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {trade.descriptor}
                                    </p>
                                </div>

                                <ul className="mt-auto space-y-2 border-t border-border pt-5 text-sm">
                                    {trade.examples.map((ex) => (
                                        <li
                                            key={ex}
                                            className="flex items-baseline gap-3 text-muted-foreground"
                                        >
                                            <span className="font-mono text-[10px] text-muted-foreground/70">
                                                →
                                            </span>
                                            <span>{ex}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Link>
                        </StaggerItem>
                    );
                })}
            </Stagger>

            {/* Disclosure */}
            <Reveal delay={0.1}>
                <p className="mt-10 max-w-3xl text-sm italic leading-relaxed text-muted-foreground">
                    Mendr&rsquo;s diagnosis is a starting point — not a final verdict. Every report
                    includes a confidence score and a reminder that a site inspection is still needed.
                    We&rsquo;d rather be useful and honest than confident and wrong.
                </p>
            </Reveal>
        </SectionFrame>
    );
}
