'use client';

import { Paperclip } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { SERVICE_ITEMS, getServiceIcon, type ServiceLabel } from '@/lib/service-icons';
import { cn } from '@/lib/utils';

type ChatWelcomeProps = {
    selectedService: ServiceLabel | null;
    onSelectService: (label: ServiceLabel | null) => void;
    onUpload: (file: File) => void;
    isUploading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function ChatWelcome({
    selectedService,
    onSelectService,
    onUpload,
    isUploading,
    fileInputRef,
}: ChatWelcomeProps) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = Array.from(e.target.files || []).find(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (file) onUpload(file);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer?.files || []).find(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (file) onUpload(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };

    if (selectedService) {
        const Icon = getServiceIcon(selectedService);
        return (
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                            {selectedService}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Upload an image of the issue for diagnosis.
                        </p>
                    </div>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className={cn(
                        'flex w-full max-w-md flex-col items-center gap-3 rounded-lg border-2 border-dashed border-input bg-muted/30 px-6 py-6 text-center transition-all duration-250',
                        'hover:border-border hover:bg-muted/50',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:pointer-events-none disabled:opacity-50'
                    )}
                >
                    <Paperclip className="size-6 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                        {isUploading ? 'Uploading…' : 'Upload Image'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        or drag and drop
                    </span>
                </button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => onSelectService(null)}
                >
                    Choose different service
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    What do you need help with?
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                    Select a service below, then upload an image for diagnosis.
                </p>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {SERVICE_ITEMS.map(({ label }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => onSelectService(label)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-input/60 bg-card/60 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-input hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <span className="line-clamp-1">{label}</span>
                        <span className="text-[11px] font-medium text-muted-foreground">
                            Start diagnosis
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
