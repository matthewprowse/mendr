'use client';

/**
 * Route: /start
 * Unified flow: photos + description → location → diagnose or skip
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/auth/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientId } from '@/lib/client-random-id';
import {
    createSelectedPhotoId,
    isHeicLike,
    normalizeSelectedPhoto,
    readFileAsDataUrl,
    uploadPhotoToStorage,
    type SelectedPhoto,
} from '@/lib/diagnosis/photo-upload';
import { setPendingDiagnosisImages } from '@/lib/diagnosis/pending-diagnosis-images-cache';
import { setImageData } from '@/lib/image-store';
import { Textarea } from '@/components/ui/textarea';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import {
    ArrowLeft,
    Camera,
    Loader,
    GripVertical,
    Ellipsis,
    X,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FlowTopBar, StepHeading } from '@/components/match/flow-shell';
import { useAuth } from '@/context/auth-context';
import { BRAND_NAME } from '@/lib/brand-system';

type FlowStep = 1 | 2;
type LocationMode = 'choose' | 'gps-loading' | 'gps-done' | 'manual';
// SelectedPhoto and related types live in @/lib/diagnosis/photo-upload so the
// `/diagnosis` refine overlay can reuse the same shape.

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

// ── Voice → text (records audio, transcribes via Gemini, appends to a field) ──

function VoiceTranscribeButton({
    onTranscript,
    disabled,
}: {
    /** Called with the transcribed text when a recording is successfully transcribed. */
    onTranscript: (text: string) => void;
    disabled?: boolean;
}) {
    const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const [elapsedSec, setElapsedSec] = useState(0);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const stopTracks = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    };

    const start = async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            toast.error('Voice recording is not supported in this browser.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stopTracks();
                const type = recorder.mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type });
                if (blob.size === 0) {
                    setState('idle');
                    return;
                }
                setState('transcribing');
                try {
                    const form = new FormData();
                    form.append('audio', blob, 'recording.webm');
                    form.append('source', 'start_description');
                    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
                    const data = (await res.json().catch(() => ({}))) as {
                        transcript?: string;
                        error?: string;
                    };
                    if (!res.ok) {
                        toast.error(data.error || 'Could not transcribe the recording.');
                    } else if (data.transcript?.trim()) {
                        onTranscript(data.transcript.trim());
                    } else {
                        toast.error('No speech detected — try again.');
                    }
                } catch {
                    toast.error('Transcription failed. Please try again.');
                } finally {
                    setState('idle');
                }
            };
            recorder.start();
            recorderRef.current = recorder;
            setState('recording');
        } catch {
            stopTracks();
            setState('idle');
            toast.error('Microphone access was blocked. Allow mic access and try again.');
        }
    };

    // Finish recording → transcribe (handled in recorder.onstop).
    const stop = () => {
        recorderRef.current?.stop();
        recorderRef.current = null;
    };

    // Discard the in-flight recording without transcribing.
    const cancel = () => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (recorder) {
            recorder.onstop = null; // prevent the transcribe step
            try {
                recorder.stop();
            } catch {
                // already stopped
            }
        }
        chunksRef.current = [];
        stopTracks();
        setState('idle');
    };

    // Stop any in-flight recording if the component unmounts.
    useEffect(() => () => stopTracks(), []);

    // Tick an elapsed-time counter while recording so the UI can show how long
    // the recording has been running.
    useEffect(() => {
        if (state !== 'recording') return;
        const startedAt = Date.now();
        setElapsedSec(0);
        const id = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
        }, 250);
        return () => clearInterval(id);
    }, [state]);

    const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

    return (
        <div className="flex flex-col">
            {state === 'idle' && (
                <div className="flex justify-center">
                    <Button
                        type="button"
                        variant="secondary"
                        aria-label="Record Description"
                        title="Record Description"
                        disabled={disabled}
                        onClick={start}
                    >
                        Record Description
                    </Button>
                </div>
            )}

            {state === 'recording' && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground" aria-live="polite">
                        Recording ({elapsedLabel})
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            aria-label="Stop and transcribe"
                            title="Stop and transcribe"
                            onClick={stop}
                        >
                            Done
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Cancel recording"
                            title="Cancel recording"
                            onClick={cancel}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                </div>
            )}

            {state === 'transcribing' && (
                <div className="flex justify-center">
                    <Button type="button" variant="secondary" disabled>
                        Transcribing…
                    </Button>
                </div>
            )}
        </div>
    );
}

// ── Step 1 — Photos + Description ─────────────────────────────────────────────

function Step1({
    selectedPhotos,
    setSelectedPhotos,
    description,
    setDescription,
    onContinue,
    onHeaderTitleChange,
}: {
    selectedPhotos: SelectedPhoto[];
    setSelectedPhotos: React.Dispatch<React.SetStateAction<SelectedPhoto[]>>;
    description: string;
    setDescription: (v: string) => void;
    onContinue: () => void;
    onHeaderTitleChange?: (title: string | null) => void;
}) {
    // Surface the page title in the sticky header once the H1 is fully
    // scrolled out of the visible area. Uses a scroll listener (not
    // IntersectionObserver) because the latter has timing issues with the
    // initial mount state when the scroll container doesn't yet have a stable
    // layout.
    const scrollRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        const root = scrollRef.current;
        const target = headingRef.current;
        const onChange = onHeaderTitleChange;
        if (!root || !target || !onChange) return;
        const update = () => {
            const rootRect = root.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            // Title goes into the header the moment the H1's bottom is at or
            // above the scroll container's top edge — i.e. no pixel of the H1
            // is visible anymore. The instant any pixel re-enters, we hide.
            const fullyScrolledOut = targetRect.bottom <= rootRect.top;
            onChange(fullyScrolledOut ? "What's Happening?" : null);
        };
        root.addEventListener('scroll', update, { passive: true });
        // Compute initial state on next frame so layout is settled.
        const rafId = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(rafId);
            root.removeEventListener('scroll', update);
            onChange(null);
        };
    }, [onHeaderTitleChange]);
    // Hard cap. Gemini 2.5 Flash processes images with parallel attention —
    // past four photos the attention dilutes faster than the diagnostic value
    // of additional photos.
    const MAX_PHOTOS = 4;
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const hasPendingPhotos = selectedPhotos.some((p) => p.status === 'pending');
    const hasReadyPhoto = selectedPhotos.some((p) => p.status === 'ready');
    // A photo OR a meaningful description is enough to proceed. The 15-char floor
    // mirrors the text-only minimum enforced in the processing pipeline.
    const hasEnoughText = description.trim().length >= 15;
    const canContinue = (hasReadyPhoto || hasEnoughText) && !hasPendingPhotos;

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
        <div ref={scrollRef} className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                    <div className="flex flex-col gap-8 w-full max-w-xl">
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

                        <div className="flex w-full flex-col items-center gap-3 text-center">
                            <h1
                                ref={headingRef}
                                className="text-2xl font-semibold text-foreground"
                            >
                                What&apos;s Happening?
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Add a few photos and tell us what&apos;s happening. We&apos;ll work out what&apos;s wrong and roughly what it&apos;ll take to fix.</p>
                        </div>

                        {/* Photo upload */}
                        {selectedPhotos.length === 1 || selectedPhotos.length === 3 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {selectedPhotos.map((p, i) => (
                                    <PhotoTile
                                        key={p.id}
                                        photo={p}
                                        index={i}
                                        showNumber={selectedPhotos.length > 1}
                                        isDraggable={p.status === 'ready' && selectedPhotos.length > 1}
                                        isDragged={draggedPhotoId === p.id}
                                        isDropTarget={dropTargetId === p.id && draggedPhotoId !== p.id}
                                        onRemove={handleRemovePhoto}
                                        onDragStart={handleDragStart(p.id)}
                                        onDragOver={handleDragOver(p.id)}
                                        onDragLeave={handleDragLeave(p.id)}
                                        onDrop={handleDrop(p.id)}
                                        onDragEnd={handleDragEnd}
                                    />
                                ))}
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleSelectPhotos}
                                    className="aspect-square h-auto w-full"
                                >
                                    Add Photos
                                </Button>
                            </div>
                        ) : selectedPhotos.length >= 2 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {selectedPhotos.map((p, i) => (
                                    <PhotoTile
                                        key={p.id}
                                        photo={p}
                                        index={i}
                                        showNumber
                                        isDraggable={p.status === 'ready' && selectedPhotos.length > 1}
                                        isDragged={draggedPhotoId === p.id}
                                        isDropTarget={dropTargetId === p.id && draggedPhotoId !== p.id}
                                        onRemove={handleRemovePhoto}
                                        onDragStart={handleDragStart(p.id)}
                                        onDragOver={handleDragOver(p.id)}
                                        onDragLeave={handleDragLeave(p.id)}
                                        onDrop={handleDrop(p.id)}
                                        onDragEnd={handleDragEnd}
                                    />
                                ))}
                            </div>
                        ) : null}

                        {selectedPhotos.length > 1 ? (
                            <p className="-mt-4 text-center text-xs text-muted-foreground">
                                Drag and drop to reorder your photos, with the most relevant first.
                            </p>
                        ) : null}

                        {selectedPhotos.length !== 1 && selectedPhotos.length !== 3 && selectedPhotos.length < MAX_PHOTOS ? (
                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleSelectPhotos}
                                >
                                    Add Photos
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Add up to four photos. Clear, well lit ones work best.</p>
                            </div>
                        ) : null}

                        {/* Description */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="description">Problem Description</Label>
                                <span className="text-xs text-muted-foreground">
                                    {description.length} / 500
                                </span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Textarea
                                    id="description"
                                    maxLength={500}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Tell us what&apos;s happening and when it first started here.</p>
                            </div>
                        </div>

                        <VoiceTranscribeButton
                            onTranscript={(text) => {
                                const base = description.trim();
                                const next = (base ? `${base} ${text}` : text).slice(0, 500);
                                setDescription(next);
                            }}
                        />
                    </div>
                </div>

                <div className="sticky bottom-0 shrink-0 bg-background p-4">
                    <div className="w-full max-w-xl mx-auto flex flex-col gap-2">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={onContinue}
                            disabled={!canContinue}
                        >
                            {hasPendingPhotos ? (
                                <>
                                    Processing Photos...
                                </>
                            ) : canContinue ? (
                                'Continue'
                            ) : (
                                'Continue'
                            )}
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                            It is free to use, and you don&apos;t need an account yet.</p>
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
                <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                    <div className="flex flex-col gap-8 w-full max-w-xl">
                        {locationMode === 'manual' ? (
                            <>
                                <StepHeading
                                    title="Where's the Property?"
                                    sub="We use your location to find contractors nearby."
                                />
                                <input
                                    ref={manualRef}
                                    type="text"
                                    className="w-full bg-transparent border-none focus:outline-none text-[22px] font-medium text-center leading-relaxed text-foreground placeholder:text-muted-foreground focus:placeholder-transparent"
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
                                    title="Get Nearby Pros"
                                    sub="We'll use the property's location to find specialists nearby. Tell us where it is and we'll show who can help."
                                />

                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={isGettingLocation}
                                        onClick={async () => {
                                            setLocationMode('gps-loading');
                                            await onGetCurrentLocation();
                                        }}
                                    >
                                        {isGettingLocation ? 'Getting Location…' : 'Use My Location'}
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground">
                                        We only use this to find specialists nearby, nothing else.</p>
                                </div>

                                {savedAddresses.length > 0 && (
                                    <div className="flex flex-col">
                                        {savedAddresses.map((addr, index) => {
                                            const select = () => {
                                                setLocationValue(addr.address);
                                                setLocationMode('gps-done');
                                            };
                                            return (
                                                <div key={addr.id}>
                                                    {index > 0 && <Separator />}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={select}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                select();
                                                            }
                                                        }}
                                                        className="flex cursor-pointer items-center gap-3 py-3"
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="icon"
                                                            className="size-12 shrink-0"
                                                            tabIndex={-1}
                                                            aria-hidden="true"
                                                        />
                                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                            <p className="text-sm font-medium">{addr.label}</p>
                                                            <p className="line-clamp-1 text-xs text-muted-foreground">{addr.address}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <Separator />

                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="search-address">Search Address</Label>
                                    <div className="flex flex-col gap-2">
                                        <Input
                                            id="search-address"
                                            ref={locationInputRef}
                                            value={locationValue}
                                            onChange={(e) => setLocationValue(e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Start typing your address and then pick it from the list.</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="sticky bottom-0 shrink-0 bg-background p-4">
                    <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full text-muted-foreground"
                            disabled={!hasLocation || isSubmitting}
                            onClick={() => void onSkip()}
                        >
                            Find Pros Now
                        </Button>
                        <div className="flex flex-col gap-2">
                            <Button
                                type="button"
                                className="w-full"
                                disabled={!hasLocation || isSubmitting}
                                onClick={() => void onDiagnose()}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Spinner className="shrink-0" aria-hidden />
                                        Starting…
                                    </>
                                ) : (
                                    'Continue'
                                )}
                            </Button>
                            <p className="text-center text-xs text-muted-foreground">
                                We&apos;ll diagnose the fault first, then show you specialists.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export function StartPageClient() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [step, setStep] = useState<FlowStep>(1);
    const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
    const [description, setDescription] = useState('');
    const [headerTitle, setHeaderTitle] = useState<string | null>(null);

    // Show the avatar only for real users, not anonymous Supabase sessions.
    const isLoggedIn = !!user && !!user.email;
    const userMeta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
    const avatarUrl = userMeta.avatar_url || userMeta.picture;
    const displayName =
        userMeta.full_name || userMeta.name || user?.email || '';
    const initials = displayName
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const handleSignOut = useCallback(async () => {
        await signOut();
        router.push('/');
    }, [router, signOut]);

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
                className="p-4"
                leftSlot={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Go back"
                        onClick={() => {
                            if (step > 1) {
                                setStep(
                                    (s) => (Math.max(1, s - 1) as FlowStep)
                                );
                                return;
                            }
                            router.back();
                        }}
                    >
                        <ArrowLeft strokeWidth={2.5} />
                    </Button>
                }
                centerSlot={
                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                        {headerTitle ?? BRAND_NAME}
                    </p>
                }
                rightSlot={
                    isLoggedIn ? (
                        <DropdownMenu key="menu">
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Account menu"
                                    className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <Avatar>
                                        {avatarUrl ? (
                                            <AvatarImage
                                                src={avatarUrl}
                                                alt={displayName}
                                            />
                                        ) : null}
                                        <AvatarFallback>
                                            {initials || '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <Link href="/home">Home</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/diagnoses">History</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/favourites">Favourites</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/settings">Settings</Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onSelect={() => void handleSignOut()}
                                >
                                    Log Out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/auth/login">Login</Link>
                        </Button>
                    )
                }
            />

            <div className="flex-1 overflow-hidden">
                {step === 1 && (
                    <Step1
                        selectedPhotos={selectedPhotos}
                        setSelectedPhotos={setSelectedPhotos}
                        description={description}
                        setDescription={setDescription}
                        onContinue={() => setStep(2)}
                        onHeaderTitleChange={setHeaderTitle}
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

// ── Photo tile ──────────────────────────────────────────────────────────────

function PhotoTile({
    photo,
    index,
    showNumber = false,
    isDraggable = false,
    isDragged = false,
    isDropTarget = false,
    onRemove,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
}: {
    photo: SelectedPhoto;
    index: number;
    showNumber?: boolean;
    isDraggable?: boolean;
    isDragged?: boolean;
    isDropTarget?: boolean;
    onRemove?: (photoId: string) => void;
    onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd?: () => void;
}) {
    const isReady = photo.status === 'ready' && photo.previewSrc;
    const wrapperCls = [
        'relative aspect-square overflow-hidden rounded-lg border border-border transition-all duration-150',
        isReady ? 'bg-background' : 'bg-secondary',
        isDraggable ? 'cursor-grab active:cursor-grabbing' : '',
        isDragged ? 'opacity-50' : '',
        isDropTarget ? 'ring-2 ring-foreground' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={wrapperCls}
            draggable={isDraggable}
            onDragStart={isDraggable ? onDragStart : undefined}
            onDragOver={isDraggable ? onDragOver : undefined}
            onDragLeave={isDraggable ? onDragLeave : undefined}
            onDrop={isDraggable ? onDrop : undefined}
            onDragEnd={isDraggable ? onDragEnd : undefined}
        >
            {isReady ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={photo.previewSrc!}
                    alt={photo.file.name || ''}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            ) : photo.status === 'pending' ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center">
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                        {photo.errorMessage ?? 'Could not process this image.'}
                    </p>
                </div>
            )}
            {showNumber ? (
                <Badge variant="count" className="absolute bottom-2 left-2">
                    {index + 1}
                </Badge>
            ) : null}
            {isReady && onRemove ? (
                <Badge asChild variant="outline">
                    <button
                        type="button"
                        className="absolute right-2 top-2 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(photo.id);
                        }}
                        aria-label="Remove photo"
                    >
                        Remove
                    </button>
                </Badge>
            ) : null}
        </div>
    );
}
