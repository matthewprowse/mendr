'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DiagnosisData } from './types';

export function NoImageFallback({
    router,
    diagnosis,
    onImageUpload,
    isUploading,
}: {
    router: ReturnType<typeof useRouter>;
    diagnosis: DiagnosisData | null;
    onImageUpload: (file: File) => void;
    isUploading: boolean;
}) {
    const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onImageUpload(file);
        e.target.value = '';
    };

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
            <h2 className="text-lg font-semibold text-foreground">
                {diagnosis?.diagnosis ? 'Add an image to continue' : 'Upload an image to get started'}
            </h2>
            {diagnosis?.diagnosis && (
                <p className="text-sm text-muted-foreground text-center max-w-md">
                    Your diagnosis: {diagnosis.diagnosis}. Upload a new or additional image to continue the conversation.
                </p>
            )}
            <input
                id="fallback-photo-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileChosen}
                disabled={isUploading}
            />
            <label
                htmlFor="fallback-photo-input"
                className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer disabled:opacity-50"
            >
                {isUploading ? 'Uploading…' : 'Choose image'}
            </label>
            <Button variant="ghost" onClick={() => router.push('/')}>
                Start over
            </Button>
        </div>
    );
}
