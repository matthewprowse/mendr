'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type DiagnosisMetaPanelProps = {
    trade: string;
    tradeDetail?: string | null;
    urgencyKey: string;
    urgencyLabel: string;
    className?: string;
};

const SMALL_TITLE_WORDS = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'in',
    'nor',
    'of',
    'on',
    'or',
    'the',
    'to',
    'up',
    'via',
]);

function toReadableTitleCase(value: string): string {
    const raw = value.trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const words = raw.split(' ');
    return words
        .map((word, index) => {
            const lower = word.toLowerCase();
            const isFirst = index === 0;
            const isLast = index === words.length - 1;
            if (!isFirst && !isLast && SMALL_TITLE_WORDS.has(lower)) {
                return lower;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

export function DiagnosisMetaPanel({
    trade,
    tradeDetail,
    urgencyKey,
    urgencyLabel,
    className,
}: DiagnosisMetaPanelProps) {
    const tradeMain = (trade || '').trim() || 'Not specified';
    const detail = (tradeDetail ?? '').trim();
    const showDetail =
        detail.length > 0 && detail.toLowerCase() !== tradeMain.toLowerCase();
    const detailLabel = toReadableTitleCase(showDetail ? detail : tradeMain);
    const tradeBadgeLabel = toReadableTitleCase(tradeMain);

    return (
        <div
            className={cn(
                'mb-3 flex flex-row items-center justify-between gap-3',
                className
            )}
        >

            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{detailLabel}</p>
                <div>
                    <Badge variant="secondary">{tradeBadgeLabel}</Badge>
                </div>
            </div>

            <p className="self-center text-sm text-muted-foreground">{urgencyLabel}</p>
        </div>
    );
}
