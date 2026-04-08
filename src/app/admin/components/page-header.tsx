'use client';

type AdminPageHeaderProps = {
    title: string;
};

export function AdminPageHeader({ title }: AdminPageHeaderProps) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore.
            </p>
        </div>
    );
}
