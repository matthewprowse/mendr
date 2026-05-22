'use client';

/**
 * Route: /start
 * Unified flow: photos + description → location → diagnose or skip
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/auth/supabase';
import { useRouter } from 'next/navigation';
import { createClientId } from '@/lib/client-random-id';
import { compressImage } from '@/lib/image-compression';
import { setPendingDiagnosisImages } from '@/lib/diagnosis/pending-diagnosis-images-cache';
import { setImageData } from '@/lib/image-store';
import { Textarea } from '@/components/ui/textarea';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import {
    CircleNotch,
    MapPin,
    Camera,
    DotsThree,
    DotsSixVertical,
} from '@phosphor-icons/react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar, StepHeading } from '@/components/match/flow-shell';
import { INK } from '@/lib/design-tokens';

type FlowStep = 1 | 2;
type LocationMode = 'choose' | 'gps-loading' | 'gps-done' | 'manual';
type SelectedPhotoStatus = 'pending' | 'ready' | 'error';
type SelectedPhoto = {
    id: string;
    file: File;
    status: SelectedPhotoStatus;
    previewSrc: string | null;
    diagnosisSrc: string | null;
    errorMessage?: string;
};

const WESTERN_CAPE_ERROR = 'Please use a location in the Western Cape, South Africa.';
const LOCATION_GENERIC_ERROR = 'Could not verify your location. Please try again or enter your address manually.';

function toUserFriendlyLocationError(input: string | null | undefined): string {
    const msg = (input ?? '').trim();
    if (!msg) return LOCATION_GENERIC_ERROR;
    const lower = msg.toLowerCase();
    if (lower.includes('outside the western cape') || lower.includes('western cape')) {
        return 'This location looks outside the Western Cape. Please use an address in Western Cape, South Africa.';
    }
    if (lower.includes('request_denied') || lower.includes('api key') || lower.includes('not authorized')) {
        return 'Location services are temporarily unavailable. Please enter your address manually for now.';
    }
    if (lower.includes('over_query_limit') || lower.includes('quota') || lower.includes('rate limit')) {
        return 'Location services are busy right now. Please try again in a minute or enter your address manually.';
    }
    if (lower.includes('zero_results') || lower.includes('no geocoding results')) {
        return 'We could not find that location. Try a fuller street address in Western Cape, South Africa.';
    }
    if (lower.includes('timeout')) {
        return 'Location check timed out. Please try again or enter your address manually.';
    }
    if (lower.includes('network')) {
        return 'Network issue while checking your location. Please try again or enter your address manually.';
    }
    return LOCATION_GENERIC_ERROR;
}

function createSelectedPhotoId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isHeicLike(file: File): boolean {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/i.test(name);
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === 'string') { resolve(result); return; }
            reject(new Error('Could not read the selected image.'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
    });
}

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

async function normalizeSelectedPhoto(file: File): Promise<SelectedPhoto> {
    let raw = await readFileAsDataUrl(file);
    if (isHeicLike(file)) {
        const form = new FormData();
        form.set('file', file);
        const res = await fetch('/api/convert-heic', { method: 'POST', body: form });
        const json = (await res.json().catch(() => ({}))) as { dataUrl?: string };
        if (!res.ok || typeof json.dataUrl !== 'string' || !json.dataUrl.startsWith('data:image/')) {
            throw new Error('Could not convert HEIC image.');
        }
        raw = json.dataUrl;
    }
    const compressed = await compressImage(raw);
    const normalizedFile = dataUrlToFile(compressed, file.name);
    return {
        id: createSelectedPhotoId(),
        file: normalizedFile,
        status: 'ready',
        previewSrc: compressed,
        diagnosisSrc: compressed,
    };
}

async function uploadPhotoToStorage(file: File, conversationId: string): Promise<string | null> {
    try {
        const form = new FormData();
        form.set('conversationId', conversationId);
        form.set('file', file);
        const res = await fetch('/api/upload-image', { method: 'POST', body: form });
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { imageUrl?: string } | null;
        return typeof json?.imageUrl === 'string' && json.imageUrl.startsWith('http')
            ? json.imageUrl
            : null;
    } catch {
        return null;
    }
}

// ── Step 1 — Photos + Description ─────────────────────────────────────────────

function Step1({
    selectedPhotos,
    setSelectedPhotos,
    description,
    setDescription,
    onContinue,
}: {
    selectedPhotos: SelectedPhoto[];
    setSelectedPhotos: React.Dispatch<React.SetStateAction<SelectedPhoto[]>>;
    description: string;
    setDescription: (v: string) => void;
    onContinue: () => void;
}) {
    // Hard cap. Gemini 2.5 Flash processes images with parallel attention —
    // past four photos the attention dilutes faster than the diagnostic value
    // of additional photos.
    const MAX_PHOTOS = 4;
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const hasPendingPhotos = selectedPhotos.some((p) => p.status === 'pending');
    const hasReadyPhoto = selectedPhotos.some((p) => p.status === 'ready');
    const canContinue = hasReadyPhoto && !hasPendingPhotos;

    const handleSelectPhotos = () => uploadInputRef.current?.click();

    const handlePhotosSelected = async (incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return;
        const files = Array.from(incoming).filter(
            (f) => f.type.startsWith('image/') || isHeicLike(f),
        );
        if (files.length === 0) return;
        const remainingSlots = Math.max(0, MAX_PHOTOS - selectedPhotos.length);
        if (remainingSlots === 0) return;
        const filesToQueue = files.slice(0, remainingSlots);
        const queuedPlaceholders = filesToQueue.map((file) => ({
            id: createSelectedPhotoId(),
            file,
            status: 'pending' as const,
            previewSrc: null,
            diagnosisSrc: null,
        }));
        const pendingIdsByFile = new Map(queuedPlaceholders.map((p) => [p.file, p.id]));
        setSelectedPhotos((prev) => {
            const safeRemaining = Math.max(0, MAX_PHOTOS - prev.length);
            if (safeRemaining === 0) return prev;
            return [...prev, ...queuedPlaceholders.slice(0, safeRemaining)];
        });

        for (const file of filesToQueue) {
            const id = pendingIdsByFile.get(file);
            if (!id) continue;
            try {
                const normalized = await normalizeSelectedPhoto(file);
                setSelectedPhotos((prev) =>
                    prev.map((p) => (p.id === id ? { ...normalized, id } : p)),
                );
            } catch {
                if (isHeicLike(file)) {
                    setSelectedPhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? { ...p, status: 'error', previewSrc: null, diagnosisSrc: null, errorMessage: 'Could not convert this HEIC image.' }
                                : p,
                        ),
                    );
                    continue;
                }
                try {
                    const fallbackSrc = await readFileAsDataUrl(file);
                    setSelectedPhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? { ...p, status: 'ready', previewSrc: fallbackSrc, diagnosisSrc: fallbackSrc, errorMessage: undefined }
                                : p,
                        ),
                    );
                } catch {
                    setSelectedPhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? { ...p, status: 'error', previewSrc: null, diagnosisSrc: null, errorMessage: 'Could not process this image.' }
                                : p,
                        ),
                    );
                }
            }
        }
    };

    const handleRemovePhoto = (photoId: string) => {
        setSelectedPhotos((prev) => {
            const target = prev.find((p) => p.id === photoId);
            if (target?.previewSrc?.startsWith('blob:')) URL.revokeObjectURL(target.previewSrc);
            return prev.filter((p) => p.id !== photoId);
        });
    };

    const movePhoto = (photoId: string, direction: -1 | 1) => {
        setSelectedPhotos((prev) => {
            const idx = prev.findIndex((p) => p.id === photoId);
            if (idx < 0) return prev;
            const nextIdx = idx + direction;
            if (nextIdx < 0 || nextIdx >= prev.length) return prev;
            const copy = [...prev];
            const [moved] = copy.splice(idx, 1);
            copy.splice(nextIdx, 0, moved);
            return copy;
        });
    };

    const movePhotoToPrimary = (photoId: string) => {
        setSelectedPhotos((prev) => {
            const idx = prev.findIndex((p) => p.id === photoId);
            if (idx <= 0) return prev;
            const copy = [...prev];
            const [moved] = copy.splice(idx, 1);
            copy.unshift(moved);
            return copy;
        });
    };

    const swapPhotos = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        setSelectedPhotos((prev) => {
            const sourceIdx = prev.findIndex((p) => p.id === sourceId);
            const targetIdx = prev.findIndex((p) => p.id === targetId);
            if (sourceIdx < 0 || targetIdx < 0) return prev;
            const copy = [...prev];
            [copy[sourceIdx], copy[targetIdx]] = [copy[targetIdx], copy[sourceIdx]];
            return copy;
        });
    };

    const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);

    const handleDragStart = (photoId: string) => (e: React.DragEvent<HTMLDivElement>) => {
        setDraggedPhotoId(photoId);
        // Required for Firefox to start the drag.
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', photoId);
        } catch {
            // ignore
        }
    };

    const handleDragOver = (photoId: string) => (e: React.DragEvent<HTMLDivElement>) => {
        if (!draggedPhotoId || draggedPhotoId === photoId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTargetId !== photoId) setDropTargetId(photoId);
    };

    const handleDragLeave = (photoId: string) => () => {
        if (dropTargetId === photoId) setDropTargetId(null);
    };

    const handleDrop = (photoId: string) => (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const sourceId = draggedPhotoId ?? e.dataTransfer.getData('text/plain');
        if (sourceId && sourceId !== photoId) swapPhotos(sourceId, photoId);
        setDraggedPhotoId(null);
        setDropTargetId(null);
    };

    const handleDragEnd = () => {
        setDraggedPhotoId(null);
        setDropTargetId(null);
    };

    const handleRetryPhoto = async (photoId: string) => {
        const target = selectedPhotos.find((p) => p.id === photoId);
        if (!target) return;
        setSelectedPhotos((prev) =>
            prev.map((p) =>
                p.id === photoId
                    ? { ...p, status: 'pending', previewSrc: null, diagnosisSrc: null, errorMessage: undefined }
                    : p,
            ),
        );
        try {
            const normalized = await normalizeSelectedPhoto(target.file);
            setSelectedPhotos((prev) =>
                prev.map((p) => (p.id === photoId ? { ...normalized, id: photoId } : p)),
            );
        } catch {
            setSelectedPhotos((prev) =>
                prev.map((p) =>
                    p.id === photoId
                        ? {
                              ...p,
                              status: 'error',
                              previewSrc: null,
                              diagnosisSrc: null,
                              errorMessage: isHeicLike(p.file)
                                  ? 'Could not convert this HEIC image.'
                                  : 'Could not process this image.',
                          }
                        : p,
                ),
            );
        }
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col p-6 gap-6">
                    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto pt-4">
                        <input
                            ref={uploadInputRef}
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                                void handlePhotosSelected(e.target.files);
                                e.currentTarget.value = '';
                            }}
                        />

                        <StepHeading
                            title="Add Photos"
                            sub="Show us what needs fixing — a clear photo helps us diagnose accurately."
                        />

                        {/* Photo upload area */}
                        {selectedPhotos.length === 0 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSelectPhotos}
                                    className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-secondary/40 py-12 px-6 text-center transition-colors hover:border-foreground/30 hover:bg-secondary/60 active:bg-secondary"
                                >
                                    <Camera className="size-8 text-muted-foreground" aria-hidden />
                                    <span className="text-sm font-medium text-foreground">Tap to add photos</span>
                                    <span className="text-xs text-muted-foreground">JPEG, PNG, HEIC supported</span>
                                </button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Up to {MAX_PHOTOS} photos. Put your clearest fault photo first.
                                </p>
                            </>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedPhotos.map((photo, idx) => {
                                        const isPrimary = idx === 0;
                                        const isLast = idx === selectedPhotos.length - 1;
                                        const isDragged = draggedPhotoId === photo.id;
                                        const isDropTarget = dropTargetId === photo.id && draggedPhotoId !== photo.id;
                                        const isDraggable = photo.status === 'ready' && selectedPhotos.length > 1;
                                        return (
                                            <div
                                                key={photo.id}
                                                role="button"
                                                aria-label={`Photo ${idx + 1} of ${selectedPhotos.length}. Drag to reorder, or tap menu to move.`}
                                                aria-grabbed={isDragged ? true : undefined}
                                                draggable={isDraggable}
                                                onDragStart={isDraggable ? handleDragStart(photo.id) : undefined}
                                                onDragOver={isDraggable ? handleDragOver(photo.id) : undefined}
                                                onDragLeave={isDraggable ? handleDragLeave(photo.id) : undefined}
                                                onDrop={isDraggable ? handleDrop(photo.id) : undefined}
                                                onDragEnd={isDraggable ? handleDragEnd : undefined}
                                                className={[
                                                    'relative aspect-square overflow-hidden rounded-lg border border-border bg-background transition-all duration-150',
                                                    isDragged ? 'opacity-50 scale-95' : '',
                                                    isDropTarget ? 'ring-2 ring-primary' : '',
                                                ].join(' ').trim()}
                                            >
                                                {photo.status === 'ready' && photo.previewSrc ? (
                                                    <>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={photo.previewSrc}
                                                            alt={photo.file.name || ''}
                                                            className="h-full w-full object-cover"
                                                            draggable={false}
                                                        />
                                                        {isPrimary ? (
                                                            <Badge className="absolute top-2 left-2 bg-foreground text-background">
                                                                Primary
                                                            </Badge>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemovePhoto(photo.id)}
                                                            aria-label="Remove photo"
                                                            className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs font-semibold text-foreground shadow-sm hover:bg-background"
                                                        >
                                                            ✕
                                                        </button>
                                                        {selectedPhotos.length > 1 ? (
                                                            <>
                                                                {/* Drag handle — only visible on devices with a fine pointer (mouse). */}
                                                                <div
                                                                    aria-hidden
                                                                    className="pointer-events-none absolute bottom-2 left-2 hidden h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm [@media(pointer:fine)]:flex"
                                                                >
                                                                    <DotsSixVertical className="size-3.5" />
                                                                </div>
                                                                {/* Overflow menu — touch-friendly reorder fallback. */}
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            aria-label="Reorder photo"
                                                                            className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                                                                        >
                                                                            <DotsThree weight="bold" className="size-4" />
                                                                        </button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end" side="top">
                                                                        <DropdownMenuItem
                                                                            disabled={isPrimary}
                                                                            onSelect={() => movePhotoToPrimary(photo.id)}
                                                                        >
                                                                            Move to position 1 (Primary)
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            disabled={isPrimary}
                                                                            onSelect={() => movePhoto(photo.id, -1)}
                                                                        >
                                                                            Move forward
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            disabled={isLast}
                                                                            onSelect={() => movePhoto(photo.id, 1)}
                                                                        >
                                                                            Move backward
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </>
                                                        ) : null}
                                                    </>
                                                ) : photo.status === 'pending' ? (
                                                    <div className="flex h-full w-full flex-col items-center justify-center bg-secondary px-3 text-center">
                                                        <CircleNotch className="mb-2 size-5 animate-spin text-muted-foreground" />
                                                        <p className="line-clamp-2 text-xs text-muted-foreground">{photo.file.name}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary px-3 text-center">
                                                        <p className="line-clamp-2 text-xs text-muted-foreground">
                                                            {photo.errorMessage ?? 'Could not process this image.'}
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <Button type="button" variant="secondary" size="sm" onClick={() => void handleRetryPhoto(photo.id)}>
                                                                Retry
                                                            </Button>
                                                            <Button type="button" variant="ghost" size="sm" onClick={() => handleRemovePhoto(photo.id)}>
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {selectedPhotos.length < MAX_PHOTOS ? (
                                        <button
                                            type="button"
                                            onClick={handleSelectPhotos}
                                            aria-label="Add more photos"
                                            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/40 text-center transition-colors hover:border-foreground/30 hover:bg-secondary/60 active:bg-secondary"
                                        >
                                            <Camera className="size-6 text-muted-foreground" aria-hidden />
                                            <span className="text-xs font-medium text-foreground">Add photo</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {selectedPhotos.length} / {MAX_PHOTOS}
                                            </span>
                                        </button>
                                    ) : null}
                                </div>
                                <p className="text-center text-xs text-muted-foreground">
                                    Up to {MAX_PHOTOS} photos. Put your clearest fault photo first.
                                </p>
                            </div>
                        )}

                        {/* Description */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-foreground">
                                Describe the problem <span className="text-muted-foreground font-normal">(optional)</span>
                            </label>
                            <Textarea
                                className="h-24 w-full resize-none"
                                placeholder="e.g. My garage door won't open — the spring on the left side looks broken…"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="sticky bottom-0 shrink-0 bg-background px-6 py-3 border-t border-border/50">
                    <div className="w-full max-w-sm mx-auto">
                        <Button
                            type="button"
                            className="h-10 w-full"
                            onClick={onContinue}
                            disabled={!canContinue}
                        >
                            {hasPendingPhotos ? (
                                <>
                                    <CircleNotch className="size-4 animate-spin shrink-0" aria-hidden />
                                    Processing photos…
                                </>
                            ) : canContinue ? (
                                'Continue'
                            ) : (
                                'Add at least one photo'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Step 2 — Location + CTA ────────────────────────────────────────────────────

type SavedAddress = { id: string; label: string; address: string };

function Step2({
    locationMode,
    setLocationMode,
    locationValue,
    setLocationValue,
    isGettingLocation,
    locationInputRef,
    onGetCurrentLocation,
    onDiagnose,
    onSkip,
    isSubmitting,
    savedAddresses,
}: {
    locationMode: LocationMode;
    setLocationMode: (m: LocationMode) => void;
    locationValue: string;
    setLocationValue: (v: string) => void;
    isGettingLocation: boolean;
    locationInputRef: React.RefObject<HTMLInputElement | null>;
    onGetCurrentLocation: () => Promise<void>;
    onDiagnose: () => Promise<void>;
    onSkip: () => Promise<void>;
    isSubmitting: boolean;
    savedAddresses: SavedAddress[];
}) {
    const manualRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (locationMode === 'manual') {
            const t = setTimeout(() => manualRef.current?.focus(), 80);
            return () => clearTimeout(t);
        }
    }, [locationMode]);

    useEffect(() => {
        if (locationInputRef && 'current' in locationInputRef) {
            (locationInputRef as React.MutableRefObject<HTMLInputElement | null>).current = manualRef.current;
        }
    }, [locationMode, locationInputRef]);

    const hasLocation =
        locationMode === 'gps-done' ||
        (locationMode === 'manual' && locationValue.trim().length > 0);

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 min-h-0">
                    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
                        {locationMode === 'manual' ? (
                            <>
                                <StepHeading
                                    title="Where's the Property?"
                                    sub="We use your location to find contractors nearby."
                                />
                                <input
                                    ref={manualRef}
                                    type="text"
                                    className="w-full bg-transparent border-none focus:outline-none text-[22px] font-medium text-center leading-relaxed placeholder:text-stone-400/50 focus:placeholder-transparent"
                                    style={{ color: INK }}
                                    placeholder="Your Address"
                                    value={locationValue}
                                    onChange={(e) => setLocationValue(e.target.value)}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="mt-2 cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:underline"
                                    onClick={() => {
                                        setLocationValue('');
                                        setLocationMode('choose');
                                    }}
                                >
                                    Use GPS Instead
                                </button>
                            </>
                        ) : (
                            <>
                                <StepHeading
                                    title="Get Nearby Contractors"
                                    sub="We use your location to find vetted local professionals."
                                />

                                {savedAddresses.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                            Saved Addresses
                                        </p>
                                        {savedAddresses.map((addr) => (
                                            <button
                                                key={addr.id}
                                                type="button"
                                                className="flex w-full flex-col items-start rounded-lg border bg-secondary px-4 py-3 text-left hover:bg-secondary/80"
                                                onClick={() => {
                                                    setLocationValue(addr.address);
                                                    setLocationMode('gps-done');
                                                }}
                                            >
                                                <span className="text-sm font-medium text-foreground">{addr.label}</span>
                                                <span className="truncate text-xs text-muted-foreground">{addr.address}</span>
                                            </button>
                                        ))}
                                        <Separator />
                                    </div>
                                )}

                                <Button
                                    variant="secondary"
                                    className="h-10 w-full"
                                    disabled={isGettingLocation}
                                    onClick={async () => {
                                        setLocationMode('gps-loading');
                                        await onGetCurrentLocation();
                                    }}
                                >
                                    <MapPin className="size-4 shrink-0" aria-hidden />
                                    {isGettingLocation ? 'Getting Location…' : 'Use Current Location'}
                                </Button>

                                <Separator />

                                <div className="flex flex-col gap-3">
                                    <Label>Search Address</Label>
                                    <Input
                                        ref={locationInputRef}
                                        className="h-10 w-full"
                                        placeholder="e.g. 12 Oak Street, Stellenbosch"
                                        value={locationValue}
                                        onChange={(e) => setLocationValue(e.target.value)}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="sticky bottom-0 shrink-0 bg-background border-t border-border/50 px-6 py-4">
                    <div className="w-full max-w-sm mx-auto flex flex-col gap-2">
                        <Button
                            className="h-11 w-full"
                            disabled={!hasLocation || isSubmitting}
                            onClick={() => void onDiagnose()}
                        >
                            {isSubmitting ? (
                                <>
                                    <CircleNotch className="size-4 animate-spin shrink-0" aria-hidden />
                                    Starting…
                                </>
                            ) : (
                                'Get Diagnosis & Find Contractors'
                            )}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 w-full text-muted-foreground"
                            disabled={!hasLocation || isSubmitting}
                            onClick={() => void onSkip()}
                        >
                            Find Contractors Now
                        </Button>
                        {!hasLocation && (
                            <p className="text-center text-xs text-muted-foreground">
                                Add your location to find contractors nearby.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export function StartPageClient() {
    const router = useRouter();
    const [step, setStep] = useState<FlowStep>(1);
    const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
    const [description, setDescription] = useState('');

    // Conversation ID created at mount so background uploads can start immediately.
    const [conversationId] = useState(() => createClientId());
    const [photoStorageUrls, setPhotoStorageUrls] = useState<Record<string, string>>({});
    const [uploadingPhotoIds, setUploadingPhotoIds] = useState<Set<string>>(new Set());

    const [locationValue, setLocationValue] = useState('');
    const [locationMode, setLocationMode] = useState<LocationMode>('choose');
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const locationInputRef = useRef<HTMLInputElement | null>(null);
    const autocompleteRef = useRef<{ remove: () => void } | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

    // Load saved addresses if the user is authenticated
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const supabase = getSupabase();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session || cancelled) return;
                const res = await fetch('/api/account/locations', { credentials: 'same-origin' });
                if (!res.ok || cancelled) return;
                const json = (await res.json().catch(() => null)) as { locations?: unknown } | null;
                const locs = Array.isArray(json?.locations) ? json!.locations as SavedAddress[] : [];
                if (!cancelled && locs.length > 0) setSavedAddresses(locs);
            } catch {
                // Non-fatal
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        document.documentElement.classList.add('start-overflow-lock');
        document.body.classList.add('start-overflow-lock');
        return () => {
            document.documentElement.classList.remove('start-overflow-lock');
            document.body.classList.remove('start-overflow-lock');
        };
    }, []);

    // Background photo upload — fires as each photo turns 'ready'.
    useEffect(() => {
        for (const photo of selectedPhotos) {
            if (
                photo.status === 'ready' &&
                !photoStorageUrls[photo.id] &&
                !uploadingPhotoIds.has(photo.id)
            ) {
                setUploadingPhotoIds((prev) => new Set(prev).add(photo.id));
                void uploadPhotoToStorage(photo.file, conversationId).then((url) => {
                    if (url) setPhotoStorageUrls((prev) => ({ ...prev, [photo.id]: url }));
                    setUploadingPhotoIds((prev) => {
                        const next = new Set(prev);
                        next.delete(photo.id);
                        return next;
                    });
                });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPhotos, conversationId]);

    // Google Places autocomplete on location input
    useEffect(() => {
        if (step !== 2 || locationMode !== 'manual') return;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
        if (!apiKey || typeof window === 'undefined') return;
        let cancelled = false;
        void (async () => {
            try {
                ensureGoogleMapsLoaderOptions(apiKey);
                await importLibrary('places');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (cancelled || !(window as any).google?.maps) return;
                const el = locationInputRef.current;
                if (!el) return;
                autocompleteRef.current?.remove();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ac = new (window as any).google.maps.places.Autocomplete(el, {
                    fields: ['formatted_address', 'name'],
                    componentRestrictions: { country: 'za' },
                });
                autocompleteRef.current = ac.addListener('place_changed', () => {
                    const place = ac.getPlace();
                    const formatted = place?.formatted_address || place?.name || '';
                    if (formatted) setLocationValue(formatted);
                });
            } catch {
                /* silent */
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, locationMode]);

    const geocodeInWesternCape = async (payload: { address?: string; lat?: number; lng?: number }) => {
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, westernCapeOnly: true }),
            });
            const data = (await res.json().catch(() => null)) as { address?: string; error?: string } | null;
            if (!res.ok) return { address: null, error: data?.error || WESTERN_CAPE_ERROR };
            return {
                address: typeof data?.address === 'string' && data.address.trim() ? data.address.trim() : null,
                error: null,
            };
        } catch {
            return { address: null, error: 'Could not validate this location. Please try again.' };
        }
    };

    const handleGetCurrentLocation = async () => {
        if (!navigator.geolocation) {
            toast.error('Location is not supported on this device.');
            setLocationMode('choose');
            return;
        }
        setIsGettingLocation(true);
        try {
            const getPos = (opts: PositionOptions) =>
                new Promise<GeolocationPosition>((res, rej) =>
                    navigator.geolocation.getCurrentPosition(res, rej, opts),
                );
            let pos: GeolocationPosition;
            try {
                pos = await getPos({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
            } catch {
                pos = await getPos({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
            }
            const result = await geocodeInWesternCape({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            if (!result.address) {
                toast.error(toUserFriendlyLocationError(result.error || WESTERN_CAPE_ERROR));
                setLocationMode('choose');
                return;
            }
            setLocationValue(result.address);
            setLocationMode('gps-done');
        } catch (err) {
            const code = (err as { code?: number })?.code;
            toast.error(
                code === 1
                    ? 'Allow location access in your browser settings and try again.'
                    : code === 3
                      ? 'Location timed out. Try entering your address manually.'
                      : 'Could not get your location. Please try again.',
            );
            setLocationMode('choose');
        } finally {
            setIsGettingLocation(false);
        }
    };

    const buildAndNavigate = useCallback(async (skipReport: boolean) => {
        if (!locationValue.trim()) return;
        setIsSubmitting(true);
        try {
            const readyPhotos = selectedPhotos.filter(
                (p): p is SelectedPhoto & { diagnosisSrc: string } =>
                    p.status === 'ready' && typeof p.diagnosisSrc === 'string',
            );

            const firstPhoto = readyPhotos[0];
            if (firstPhoto) setImageData(conversationId, firstPhoto.diagnosisSrc, firstPhoto.file.name);

            const imageSources: string[] = readyPhotos
                .map((p) => photoStorageUrls[p.id] ?? p.diagnosisSrc)
                .filter((src): src is string => Boolean(src))
                // Cap matches the server-side and Gemini-attention budget.
                .slice(0, 4);

            setPendingDiagnosisImages(conversationId, imageSources);

            if (imageSources[0]) {
                try { sessionStorage.setItem(`pending_diagnosis_image_url:${conversationId}`, imageSources[0]); } catch { /* ignore */ }
            }
            try { sessionStorage.setItem(`pending_diagnosis_image_urls:${conversationId}`, JSON.stringify(imageSources)); } catch { /* ignore */ }

            const trimmedDesc = description.trim();
            if (trimmedDesc) {
                try { sessionStorage.setItem(`pending_diagnosis_prompt:${conversationId}`, trimmedDesc); } catch { /* ignore */ }
            }
            try { sessionStorage.setItem(`pending_diagnosis_location:${conversationId}`, locationValue.trim()); } catch { /* ignore */ }

            const qp = new URLSearchParams();
            qp.set('location', locationValue.trim());
            if (skipReport) qp.set('skipReport', 'true');
            router.push(`/processing/${encodeURIComponent(conversationId)}?${qp.toString()}`);
        } catch {
            toast.error('Could not start. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [locationValue, selectedPhotos, description, conversationId, photoStorageUrls, router]);

    const handleDiagnose = useCallback(() => buildAndNavigate(false), [buildAndNavigate]);
    const handleSkip = useCallback(() => buildAndNavigate(true), [buildAndNavigate]);

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            <FlowTopBar
                onBack={() => {
                    if (step > 1) {
                        setStep((s) => (Math.max(1, s - 1) as FlowStep));
                        return;
                    }
                    router.back();
                }}
            />

            <div className="flex-1 overflow-hidden">
                {step === 1 && (
                    <Step1
                        selectedPhotos={selectedPhotos}
                        setSelectedPhotos={setSelectedPhotos}
                        description={description}
                        setDescription={setDescription}
                        onContinue={() => setStep(2)}
                    />
                )}
                {step === 2 && (
                    <Step2
                        locationMode={locationMode}
                        setLocationMode={setLocationMode}
                        locationValue={locationValue}
                        setLocationValue={setLocationValue}
                        isGettingLocation={isGettingLocation}
                        locationInputRef={locationInputRef}
                        onGetCurrentLocation={handleGetCurrentLocation}
                        onDiagnose={handleDiagnose}
                        onSkip={handleSkip}
                        isSubmitting={isSubmitting}
                        savedAddresses={savedAddresses}
                    />
                )}
            </div>
        </div>
    );
}
