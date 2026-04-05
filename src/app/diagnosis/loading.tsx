import { Spinner } from '@/components/ui/spinner';

export default function DiagnosisLoading() {
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background">
            <Spinner className="size-8 text-muted-foreground" />
        </div>
    );
}
