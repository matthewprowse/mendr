/**
 * Route: /welcome
 * First step in the scan flow. User uploads an image/video, then we continue to /diagnosis/[id].
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from 'lucide-react';

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

    const canInteract = !isUploading;
    const canPickFile = !isUploading && !pickedPreviewUrl;
    const canScan = !isUploading && !!conversationId && !!selectedFile;

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            if (!isImage) {
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
                const id = crypto.randomUUID();
                setConversationId(id);
                setSelectedFile(file);
            } finally {
                setIsUploading(false);
            }
        },
        []
    );

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
        <main className="flex flex-col gap-6 p-4 pt-22 pb-22">
            <div className="flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50">
                <Button variant="secondary" size="icon" className="h-10 w-10" onClick={() => router.back()}>
                    <ArrowLeft className="size-5" />
                </Button>
                <h3 className="text-lg text-foreground font-semibold">Scandio</h3>
                <Button variant="ghost" size="icon" className="hover:bg-transparent" />
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl text-foreground font-bold">Something Acting Up?</h1>
                <p className="text-sm text-muted-foreground">
                    You don&apos;t need to know exactly what the problem is. Show us what you&apos;re seeing and we&apos;ll figure it out together.
                </p>
            </div>

            <Input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleChange}
            />

            <button
                type="button"
                disabled={!canPickFile}
                onClick={() => {
                    if (!canPickFile) return;
                    inputRef.current?.click();
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
                        ? 'cursor-pointer hover:brightness-[0.98]'
                        : 'cursor-not-allowed',
                    pickedPreviewUrl ? 'border border-input' : '',
                    pickedPreviewUrl ? 'min-h-56' : 'min-h-56',
                ].join(' ')}
                aria-label="Select Photo"
            >
                {pickedPreviewUrl ? (
                    <div className="absolute inset-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pickedPreviewUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                ) : null}

                {!pickedPreviewUrl ? (
                    <div className="relative z-10 flex h-full h-56 flex-col items-center justify-center gap-1 p-4 text-center">
                        <p className="text-sm text-foreground font-medium">Select Photo</p>
                        <p className="text-xs text-muted-foreground">
                            {isUploading ? 'Preparing…' : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'}
                        </p>
                    </div>
                ) : null}
            </button>

            {pickedPreviewUrl ? (
                <Button
                    variant="secondary"
                    className="h-10 w-full"
                    onClick={clearPicked}
                    disabled={isUploading}
                >
                    Remove
                </Button>
            ) : null}

            {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}

            <div className="flex flex-col gap-3">
                <Label>Some Helpful Information</Label>
                <Textarea
                    className="text-sm"
                    value={helpfulInfo}
                    onChange={(e) => setHelpfulInfo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
            </div>

            <div className="flex flex-row gap-2 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
                <Button
                    variant="default"
                    className="h-10 w-full"
                    disabled={!canScan}
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

                            const res = await fetch('/api/welcome-upload-image', {
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
                    {isUploading ? 'Preparing…' : 'Scan Issue'}
                </Button>
            </div>
        </main>
    );
}

