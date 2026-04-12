/**
 * Route: /welcome
 * Step 1 of 3 in the scan flow. User uploads a photo and adds optional context,
 * then continues to /diagnosis/[id].
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FlowStepHeader } from '@/components/flow-header';
import { trackEvent } from '@/lib/analytics';
import { createClientId } from '@/lib/client-random-id';
import { compressImage } from '@/lib/image-compression';
import { Separator } from '@/components/ui/separator';


const ACCEPTED_FILE_TYPES_TEXT = 'Accepted file types: JPG, JPEG, PNG, WEBP, GIF, HEIC, HEIF';
const MAX_FILE_SIZE_TEXT = 'Max file size: 10MB';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function dataUrlToFile(dataUrl: string, fallbackName = 'upload.jpg'): File {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta?.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] || 'image/jpeg';
    const binStr = atob(base64 || '');
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binStr.charCodeAt(i);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const baseName = fallbackName.replace(/\.[^.]+$/, '') || 'upload';
    return new File([bytes], `${baseName}.${ext}`, { type: mime });
}

export default function WelcomePageClient() {
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
    const fileInputId = 'welcome-photo-input';
    const pageTitleRef = useRef<HTMLHeadingElement>(null);
    const mainScrollRef = useRef<HTMLElement>(null);
    const [showPageTitleInHeader, setShowPageTitleInHeader] = useState(false);

    const canPickFile = !isUploading;
    const canContinue = !isUploading && !!conversationId && !!selectedFile;

    const setPreviewUrl = (nextUrl: string | null) => {
        if (pickedPreviewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(pickedPreviewUrl);
        }
        setPickedPreviewUrl(nextUrl);
    };

    const processFile = useCallback(async (file: File) => {
        const type = (file.type || '').toLowerCase();
        const name = (file.name || '').toLowerCase();
        const looksLikeImage =
            type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?)$/i.test(name);
        if (!looksLikeImage) {
            setUploadError('Please upload a clear photo of the issue.');
            return;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setUploadError('That photo is too large. Please use a file under 10MB.');
            return;
        }
        setIsUploading(true);
        setUploadError(null);

        // Show a preview immediately so the UI never appears to "reset"
        // while compression/processing is still running.
        const immediatePreview = URL.createObjectURL(file);
        setPickedFileName(file.name || 'upload');
        setPreviewUrl(immediatePreview);
        setConversationId(createClientId());
        setSelectedFile(file);

        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const compressed = await compressImage(dataUrl);
            const compressedFile = dataUrlToFile(compressed, file.name);
            setPickedFileName(compressedFile.name);
            setPreviewUrl(compressed);
            setSelectedFile(compressedFile);
        } catch {
            // iPhone HEIC/HEIF images can fail canvas decoding on some browsers.
            // Fall back to the original file so upload still works.
            setUploadError('Using your original photo so we can keep going.');
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
        setPreviewUrl(null);
        setSelectedFile(null);
        setUploadError(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    useEffect(() => {
        const mainEl = mainScrollRef.current;
        const titleEl = pageTitleRef.current;
        if (!mainEl || !titleEl) return;

        const updateHeaderTitle = () => {
            const headerHeight = 64;
            const titleBottom = titleEl.getBoundingClientRect().bottom;
            setShowPageTitleInHeader(titleBottom <= headerHeight);
        };

        updateHeaderTitle();
        mainEl.addEventListener('scroll', updateHeaderTitle, { passive: true });
        window.addEventListener('resize', updateHeaderTitle);

        return () => {
            mainEl.removeEventListener('scroll', updateHeaderTitle);
            window.removeEventListener('resize', updateHeaderTitle);
        };
    }, []);

    return (
        <div className="h-dvh overflow-hidden overscroll-none flex flex-col bg-background">
            <FlowStepHeader
                step={1}
                onBack={null}
                backHref="/"
                centerLabel={showPageTitleInHeader ? 'Start Diagnosis' : 'Scandio'}
            />

            {/* Hidden file input */}
            <Input
                ref={inputRef}
                id={fileInputId}
                type="file"
                accept="image/*"
                className="absolute -left-[9999px] h-px w-px opacity-0"
                aria-label="Choose a photo from your device"
                onChange={handleChange}
            />

            {/* Scrollable content */}
            <main
                ref={mainScrollRef}
                className="min-h-0 flex flex-1 justify-center overflow-y-auto px-4 pt-20 sm:px-6"
            >
                <div className="flex w-full max-w-xl flex-col gap-8">

                    {/* Step heading */}
                    <div className="flex flex-col gap-2">
                        <h1 ref={pageTitleRef} className="text-3xl font-semibold text-foreground">Header Name</h1>
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                        </p>
                    </div>

                    
                    <div className="flex flex-col gap-4">
                        <Label>Header Name</Label>
                        {pickedPreviewUrl ? (
                            <div className="flex flex-col gap-4">
                                <div className="overflow-hidden rounded-lg border border-input bg-secondary">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={pickedPreviewUrl}
                                        alt={pickedFileName ? `Selected Photo: ${pickedFileName}` : 'Selected Photo'}
                                        className="h-48 w-full object-cover"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-10 w-full"
                                    disabled={isUploading}
                                    onClick={clearPicked}
                                >
                                    Remove Selected Photo
                                </Button>
                            </div>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    className="h-10"
                                    type="button"
                                    disabled={!canPickFile}
                                    onClick={() => inputRef.current?.click()}
                                >
                                    Select Photo
                                </Button>

                                <p
                                    className="text-xs text-muted-foreground"
                                >
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                                </p>
                            </>
                        )}
                        {uploadError ? (
                            <p className="text-sm text-destructive">{uploadError}</p>
                        ) : null}
                    </div>

                    <Separator />

                    {/* Optional context */}
                    <div className="flex flex-col gap-4">
                        <Label htmlFor="helpful-info">
                            Add More Information
                        </Label>
                        <Textarea
                            id="helpful-info"
                            className="h-18 w-full text-sm text-[14px]"
                            value={helpfulInfo}
                            onChange={(e) => setHelpfulInfo(e.target.value)}
                        />
                        <p
                            className="text-xs text-muted-foreground"
                        >
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                        </p>
                    </div>

                </div>
            </main>

            {/* Fixed bottom action bar */}
            <div className="sticky bottom-0 z-40 mt-auto bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                                    throw new Error((data as any)?.error || 'We could not upload that photo. Please try again.');
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
                                setUploadError(e instanceof Error ? e.message : 'We could not upload that photo. Please try again.');
                                return;
                            } finally {
                                setIsUploading(false);
                            }

                            trackEvent('welcome_start', { diagnosis_id: conversationId });
                            const qp = new URLSearchParams();
                            if (trade) qp.set('trade', trade);
                            const suffix = qp.toString() ? `?${qp.toString()}` : '';
                            router.push(`/diagnosis/${conversationId}${suffix}`);
                        }}
                    >
                        {isUploading ? 'Processing...' : canContinue ? 'Continue to Scandio Report' : 'Select Photo to Continue'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
