'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ChatStartPage() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);

    const processFile = useCallback(async (file: File) => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) return;

        setUploading(true);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
            const conversationId = crypto.randomUUID();
            setImageData(conversationId, finalDataUrl, file.name);
            router.push(`/chat/${conversationId}`);
        } catch (err) {
            console.error('Upload failed:', err);
            setUploading(false);
        }
    }, [router]);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processFile(file);
        },
        [processFile]
    );

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = () => setDragActive(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = '';
    };

    const handleClick = () => inputRef.current?.click();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AppHeader title="Start Diagnosis" />
            <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-md space-y-6">
                    <div className="space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Upload a photo to get started
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            We need a photo of the issue to diagnose it and find local specialists for you.
                        </p>
                    </div>

                    <div
                        onClick={!uploading ? handleClick : undefined}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`
                            relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center
                            rounded-xl border-2 border-dashed transition-colors
                            ${dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'}
                            ${uploading ? 'pointer-events-none opacity-60' : ''}
                        `}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleInputChange}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                <p className="text-sm text-muted-foreground">Processing…</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 px-6 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="text-muted-foreground"
                                    >
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" x2="12" y1="3" y2="15" />
                                    </svg>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                        Drop your photo here or click to browse
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Images or videos of the issue
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-center">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" />
                            Back to home
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
