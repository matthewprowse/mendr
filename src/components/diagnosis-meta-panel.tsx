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

    return (
        <div
            className={cn(
                'flex gap-3 flex-row justify-between mb-3',
                className
            )}
        >

            <div className="flex flex-row gap-3 items-center">
                <p className="text-sm font-medium">{detail}</p>
                <Badge variant="secondary">{tradeMain}</Badge>
            </div>

            <p className="text-sm text-muted-foreground">{urgencyLabel}</p>
        </div>
    );
}
