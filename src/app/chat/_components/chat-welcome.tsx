'use client';

import { Button } from '@/components/ui/button';
import { SERVICE_ITEMS, type ServiceLabel } from '@/lib/service-icons';
import { Separator } from '@/components/ui/separator';

type ChatWelcomeProps = {
    selectedService: ServiceLabel | null;
    onSelectService: (label: ServiceLabel | null) => void;
    onUpload: (file: File) => void;
    isUploading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onStartDirectDiagnosis?: (trade: ServiceLabel, diagnosis: string) => void;
};

export function ChatWelcome({
    selectedService: _selectedService,
    onSelectService,
    onUpload,
    isUploading: _isUploading,
    fileInputRef,
    onStartDirectDiagnosis,
}: ChatWelcomeProps) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = Array.from(e.target.files || []).find(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (file) onUpload(file);
        e.target.value = '';
    };
    return (
        <div className="flex flex-col gap-6 -mt-8">
            <div className="space-y-3">
                <div className="h-9 w-full bg-secondary rounded-lg" />

                <div className="space-y-1">
                    <div className="h-6 w-full bg-secondary rounded-md" />
                    <div className="h-6 w-full bg-secondary rounded-md" />
                </div>
            </div>

            <Separator />

            {/* Hidden input used for the initial scan upload; shared ref with footer so either trigger works */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
            />

            <div className="mt-2 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {SERVICE_ITEMS.map(({ label }) => (
                    <div
                        key={label}
                        className="flex flex-col border border-input/75 rounded-lg"
                    >
                        <div className="flex flex-col gap-1 p-4">
                            <p className="text-sm font-medium text-foreground">{label}</p>
                            <p className="text-xs text-muted-foreground">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                            </p>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="mt-3 w-fit self-start justify-start"
                                onClick={() => {
                                    onSelectService(label);
                                    if (onStartDirectDiagnosis) {
                                        const diagnosis = `${label} services`;
                                        onStartDirectDiagnosis(label, diagnosis);
                                    } else {
                                        fileInputRef.current?.click();
                                    }
                                }}
                            >
                                Start Diagnosis
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
