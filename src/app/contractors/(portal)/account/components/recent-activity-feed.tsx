import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export type RecentActivityKind = 'lead' | 'review';

export interface RecentActivityItem {
    id: string;
    kind: RecentActivityKind;
    createdAt: string;
    label: string;
    detail?: string | null;
}

export interface RecentActivityFeedProps {
    items: RecentActivityItem[];
}

function formatRelative(iso: string, now: Date = new Date()): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, now.getTime() - t);
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function KindBadge({ kind }: { kind: RecentActivityKind }) {
    const label = kind === 'lead' ? 'Lead' : 'Review';
    const tone =
        kind === 'lead'
            ? 'border-input bg-secondary text-foreground'
            : 'border-input bg-card text-muted-foreground';
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
        >
            {label}
        </span>
    );
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>
                    The last few leads and reviews on your profile.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing here yet. Activity will appear as homeowners contact you and leave
                        reviews.
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y divide-input">
                        {items.map((item) => (
                            <li key={`${item.kind}:${item.id}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <KindBadge kind={item.kind} />
                                        <span className="text-sm font-medium text-foreground">
                                            {item.label}
                                        </span>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatRelative(item.createdAt)}
                                    </span>
                                </div>
                                {item.detail ? (
                                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
