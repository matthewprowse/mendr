'use client';

import { Children, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ellipsis } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DiagnosesBarChart } from './diagnoses-bar-chart';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { UserAvatar } from '@/components/user-avatar';
import { formatRelativeDate } from '@/lib/format-date';
import type { PlatformHomeStats, UserHomeStats, DiagnosisCardRow, DiagnosesSeries } from '@/features/home/stats';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.';

export type HomeAnnouncement = {
    slug: string;
    title: string;
    summary: string | null;
    published_at: string;
};

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
    );
}

/** Wraps rows with separators between them, matching the Settings / History lists. */
function RowList({ children }: { children: React.ReactNode }) {
    const rows = Children.toArray(children);
    return (
        <div className="flex flex-col">
            {rows.map((row, i) => (
                <div key={i}>
                    {i > 0 && <Separator />}
                    {row}
                </div>
            ))}
        </div>
    );
}

/**
 * Stat row: empty secondary icon square, then a small label over a large value,
 * with an explanatory description below (helps homeowners understand metrics
 * like first-pass accuracy). Matches the row rhythm of the Settings list.
 */
function StatRow({ label, value, description }: { label: string; value: string; description?: string }) {
    return (
        <div className="flex items-start gap-3 py-3">
            <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-12 shrink-0"
                tabIndex={-1}
                aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
                {/* h-12 + justify-center lines the label+value up with the 48px icon square */}
                <div className="flex h-12 flex-col justify-center gap-1">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold text-foreground">{value}</p>
                </div>
                {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
            </div>
        </div>
    );
}

export default function HomeClient({
    platform,
    userStats,
    recentDiagnoses,
    diagnosesSeries,
    announcements = [],
}: {
    platform: PlatformHomeStats;
    userStats: UserHomeStats;
    recentDiagnoses: DiagnosisCardRow[];
    diagnosesSeries: DiagnosesSeries;
    announcements?: HomeAnnouncement[];
}) {
    const router = useRouter();

    const handleDownload = useCallback((id: string) => {
        window.open(`/report/${id}`, '_blank');
    }, []);

    const handleShare = useCallback(async (id: string) => {
        const url = `${window.location.origin}/report/${id}`;
        if (navigator.share) {
            await navigator.share({ url }).catch(() => undefined);
        } else {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied to clipboard.');
        }
    }, []);

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            <FlowTopBar
                className="p-4"
                centerSlot={
                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                        {BRAND_NAME}
                    </p>
                }
                rightSlot={<UserAvatar />}
            />

            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                {/* Page header */}
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">Home</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {/* Activities */}
                                <section className="flex flex-col gap-6">
                                    <SectionHeader title="Activities" subtitle={LOREM} />
                                    <RowList>
                                        <StatRow
                                            label="Number of Diagnoses"
                                            value={String(userStats.total)}
                                        />
                                        <StatRow
                                            label="First-Pass Accuracy"
                                            value={`${userStats.first_pass_pct}%`}
                                            description={LOREM}
                                        />
                                    </RowList>
                                    <DiagnosesBarChart series={diagnosesSeries} />
                                </section>

                                {/* Most Recent */}
                                <section className="flex flex-col gap-3">
                                    <SectionHeader title="Most Recent" subtitle={LOREM} />
                                    {recentDiagnoses.length > 0 ? (
                                        <RowList>
                                            {recentDiagnoses.map((row) => {
                                                const title =
                                                    row.title ||
                                                    row.diagnosis?.diagnosis?.trim() ||
                                                    'Untitled Diagnosis';
                                                const trade = row.diagnosis?.trade ?? null;
                                                return (
                                                    <div
                                                        key={row.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => router.push(`/report/${row.id}`)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                router.push(`/report/${row.id}`);
                                                            }
                                                        }}
                                                        className="flex cursor-pointer items-center gap-3 py-3"
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="icon"
                                                            className="size-12 shrink-0"
                                                            tabIndex={-1}
                                                            aria-hidden="true"
                                                        />
                                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <p className="line-clamp-1 flex-1 text-sm font-medium min-w-0">
                                                                    {title}
                                                                </p>
                                                                {trade ? (
                                                                    <Badge variant="secondary" className="shrink-0 text-xs">
                                                                        {trade}
                                                                    </Badge>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <div
                                                            className="flex shrink-0 items-center gap-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatRelativeDate(row.created_at)}
                                                            </span>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="size-8 text-muted-foreground hover:text-foreground"
                                                                        aria-label="More options"
                                                                    >
                                                                        <Ellipsis size={16} />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => router.push(`/report/${row.id}`)}>
                                                                        View Report
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleDownload(row.id)}>
                                                                        Download
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => void handleShare(row.id)}>
                                                                        Share
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </RowList>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No diagnoses yet.</p>
                                    )}
                                    <div className="flex flex-col gap-2">
                                        {recentDiagnoses.length > 0 ? (
                                            <Button asChild variant="ghost">
                                                <Link href="/diagnoses">View More</Link>
                                            </Button>
                                        ) : null}
                                        <Button asChild>
                                            <Link href="/start">New Diagnosis</Link>
                                        </Button>
                                    </div>
                                </section>

                                {/* What's New */}
                                {announcements.length > 0 ? (
                                    <section className="flex flex-col gap-3">
                                        <SectionHeader title="What's New" subtitle={LOREM} />
                                        <RowList>
                                            {announcements.map((a) => (
                                                <div
                                                    key={a.slug}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => router.push(`/new/${a.slug}`)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            router.push(`/new/${a.slug}`);
                                                        }
                                                    }}
                                                    className="flex cursor-pointer items-center gap-3 py-3"
                                                >
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="icon"
                                                        className="size-12 shrink-0"
                                                        tabIndex={-1}
                                                        aria-hidden="true"
                                                    />
                                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                        <p className="line-clamp-1 text-sm font-medium">{a.title}</p>
                                                        <p className="line-clamp-1 text-xs text-muted-foreground">{LOREM}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </RowList>
                                        <Button asChild variant="ghost">
                                            <Link href="/new">View More</Link>
                                        </Button>
                                    </section>
                                ) : null}

                                {/* Mendr's Numbers */}
                                <section className="flex flex-col gap-6">
                                    <SectionHeader title={`${BRAND_NAME}'s Numbers`} subtitle={LOREM} />
                                    <RowList>
                                        <StatRow
                                            label="Number of Diagnoses"
                                            value={platform.committed_total.toLocaleString('en-ZA')}
                                            description={LOREM}
                                        />
                                        <StatRow
                                            label="First-Pass Accuracy"
                                            value={`${platform.first_pass_pct}%`}
                                            description={LOREM}
                                        />
                                        <StatRow
                                            label="Average Confidence"
                                            value={`${platform.avg_confidence}%`}
                                            description={LOREM}
                                        />
                                        <StatRow
                                            label="Trades Covered"
                                            value={String(platform.trades_covered)}
                                            description={LOREM}
                                        />
                                    </RowList>
                                </section>
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
