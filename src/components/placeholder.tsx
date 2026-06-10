import { cn } from '@/lib/utils';

export function Placeholder({
    label = '',
    aspectRatio = 'aspect-video',
    className = '',
}: {
    label?: string;
    aspectRatio?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-center rounded-lg border border-border/50 bg-secondary',
                'transition-all duration-250 hover:border-border/60',
                label && 'text-center text-sm text-muted-foreground',
                aspectRatio,
                className,
            )}
        >
            {label ? <span className="max-w-[85%] px-2">{label}</span> : null}
        </div>
    );
}
