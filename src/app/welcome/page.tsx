/**
 * Route: /welcome
 * Step 1 of 3 in the scan flow. User uploads a photo and adds optional context,
 * then continues to /diagnosis/[id].
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FlowStepHeader } from '@/components/flow-header';

export default function WelcomePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trade = searchParams.get('trade') || '';

    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [pickedFileName, setPickedFileName] = useState<string | null>(null);
    const [pickedPreviewUrl, setPickedPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [helpfulInfo, setHelpfulInfo] = useState('');

    const canPickFile = !isUploading && !pickedPreviewUrl;
    const canContinue = !isUploading && !!conversationId && !!selectedFile;

    const processFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setUploadError('Please upload an image.');
            return;
        }
        setIsUploading(true);
        setUploadError(null);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            setPickedFileName(file.name);
            setPickedPreviewUrl(dataUrl);
            setConversationId(crypto.randomUUID());
            setSelectedFile(file);
        } finally {
            setIsUploading(false);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
        e.target.value = '';
    };

    const clearPicked = () => {
        setConversationId(null);
        setPickedFileName(null);
        setPickedPreviewUrl(null);
        setSelectedFile(null);
        setUploadError(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
            <FlowStepHeader
                step={1}
                onBack={() => {
                    if (typeof window !== 'undefined' && window.history.length > 1) {
                        router.back();
                        return;
                    }
                    router.push('/landing');
                }}
            />

            {/* Hidden file input */}
            <Input
                ref={inputRef}
                id="welcome-photo-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleChange}
            />

            {/* Scrollable content */}
            <div className="flex flex-1 justify-center overflow-y-auto px-4 pt-20 pb-32 sm:px-6">
                <div className="flex w-full max-w-xl flex-col gap-8">

                    {/* Step heading */}
                    <div className="flex flex-col gap-2">
                        <h1 className="text-2xl font-bold text-foreground">
                            What's Happening?
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            You don't need to know what the problem is. Select an image for diagnosis, and we'll figure out the rest.
                        </p>
                    </div>

                    {/* Photo upload area */}
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            disabled={!canPickFile}
                            onClick={() => {
                                if (!canPickFile) return;
                                const input = inputRef.current;
                                if (!input) return;
                                // iOS Safari can block click() on display:none file inputs.
                                if (typeof (input as any).showPicker === 'function') {
                                    (input as any).showPicker();
                                } else {
                                    input.click();
                                }
                            }}
                            onDragEnter={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canPickFile) return;
                                setIsDragActive(true);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canPickFile) return;
                                setIsDragActive(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDragActive(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDragActive(false);
                                if (!canPickFile) return;
                                const file = e.dataTransfer.files?.[0];
                                if (file) void processFile(file);
                            }}
                            className={[
                                'relative w-full overflow-hidden rounded-lg bg-secondary transition-all',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                isDragActive ? 'ring-2 ring-ring' : 'ring-0',
                                canPickFile
                                    ? 'cursor-pointer'
                                    : 'cursor-not-allowed',
                                pickedPreviewUrl ? 'border border-input min-h-56' : 'min-h-56',
                            ].join(' ')}
                            aria-label="Select Photo"
                        >
                            {pickedPreviewUrl ? (
                                <div className="absolute inset-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={pickedPreviewUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="relative z-10 flex h-56 flex-col items-center justify-center gap-1 p-4 text-center">
                                    <p className="text-sm font-medium text-foreground">
                                        {isUploading ? 'Preparing…' : 'Select Photo'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
                                    </p>
                                </div>
                            )}
                        </button>

                        {pickedPreviewUrl ? (
                            <Button
                                variant="secondary"
                                className="h-10 w-full"
                                onClick={clearPicked}
                                disabled={isUploading}
                            >
                                Remove Photo
                            </Button>
                        ) : null}

                        {uploadError ? (
                            <p className="text-xs text-destructive">{uploadError}</p>
                        ) : null}
                    </div>

                    {/* Optional context */}
                    <div className="flex flex-col gap-3">
                        <Label htmlFor="info">
                            Helpful Information
                        </Label>
                        <Textarea
                            id="helpful-info"
                            className="resize-none text-sm"
                            rows={3}
                            value={helpfulInfo}
                            onChange={(e) => setHelpfulInfo(e.target.value)}
                        />
                    </div>

                </div>
            </div>

            {/* Fixed bottom action bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="mx-auto w-full max-w-xl">
                    <Button
                        size="lg"
                        className="w-full"
                        disabled={!canContinue}
                        onClick={async () => {
                            if (!conversationId || !selectedFile) return;
                            setIsUploading(true);
                            setUploadError(null);
                            try {
                                const text = helpfulInfo.trim();
                                const form = new FormData();
                                form.set('conversationId', conversationId);
                                form.set('file', selectedFile);
                                if (text) form.set('initial_image_description', text);

                                const res = await fetch('/api/upload-image', {
                                    method: 'POST',
                                    body: form,
                                });

                                if (!res.ok) {
                                    const data = await res.json().catch(() => ({}));
                                    throw new Error((data as any)?.error || 'Upload failed');
                                }

                                const data = await res.json().catch(() => ({}));
                                if ((data as any)?.imageUrl && conversationId) {
                                    try {
                                        sessionStorage.setItem(
                                            `pending_diagnosis_image_url:${conversationId}`,
                                            String((data as any).imageUrl)
                                        );
                                    } catch {
                                        // Ignore storage errors; DB load still works.
                                    }
                                }
                            } catch (e) {
                                setUploadError(e instanceof Error ? e.message : 'Upload failed');
                                return;
                            } finally {
                                setIsUploading(false);
                            }

                            const qp = new URLSearchParams();
                            if (trade) qp.set('trade', trade);
                            const suffix = qp.toString() ? `?${qp.toString()}` : '';
                            router.push(`/diagnosis/${conversationId}${suffix}`);
                        }}
                    >
                        {isUploading ? 'Preparing…' : 'Continue'}
                    </Button>
                    {!canContinue && !isUploading && (
                        <p className="mt-3 text-xs text-muted-foreground text-center">
                            Select Photo to Continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
