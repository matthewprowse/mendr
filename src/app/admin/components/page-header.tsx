'use client';

type AdminPageHeaderProps = {
    title: string;
    description?: string;
};

export function AdminPageHeader({ title, description }: AdminPageHeaderProps) {
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
    );
}
