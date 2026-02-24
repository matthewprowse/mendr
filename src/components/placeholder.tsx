export function Placeholder({
    label,
    aspectRatio = 'aspect-video',
    className = '',
}: {
    label: string;
    aspectRatio?: string;
    className?: string;
}) {
    return (
        <div
            className={`flex items-center justify-center rounded-lg border border-border/50 bg-secondary/50 hover:bg-secondary/25 hover:border-border/75 transition-all duration-250 text-center text-sm text-muted-foreground ${aspectRatio} ${className}`}
        >
            <span className="max-w-[85%] px-2">{label}</span>
        </div>
    );
}
