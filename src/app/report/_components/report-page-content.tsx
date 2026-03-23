import { Card } from '@/components/ui/card';

export function ReportPageContent() {
    return (
        <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Report a Provider</h1>
                <p className="text-sm text-muted-foreground">
                    Help us keep the Scandio marketplace safe. This page is currently a placeholder.
                </p>
            </div>

            <Card className="rounded-xl border-border/50 bg-secondary/20 p-6 shadow-none">
                <p className="text-sm text-foreground">
                    Add your provider reporting UI here (search, selection, and submission form).
                </p>
            </Card>
        </main>
    );
}

