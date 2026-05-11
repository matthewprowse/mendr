'use client';

/**
 * Route: /start
 * 3-step onboarding flow: describe → photo → location → /processing/[id] → /diagnosis/[id]
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientId } from '@/lib/client-random-id';
import { compressImage } from '@/lib/image-compression';
import { setPendingDiagnosisImages } from '@/lib/pending-diagnosis-images-cache';
import { setImageData } from '@/lib/image-store';
import { Textarea } from '@/components/ui/textarea';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import {
    CircleNotch,
    MapPin,
    MagnifyingGlass,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar, StepHeading } from '@/components/match/flow-shell';
import { INK } from '@/lib/design-tokens';
import { START_DESCRIPTION_MIN_CHARS } from '@/lib/start-description-quality';
import { SERVICE_LABELS } from '@/lib/services';

const ACCENT = 'hsl(var(--foreground))';
const WESTERN_CAPE_ERROR = 'Please use a location in the Western Cape, South Africa.';
type StepNumber = 1 | 2 | 3;
type FlowStep = StepNumber;
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
            if (typeof result === 'string') {
                resolve(result);
                return;
            }
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

/** Same compress + read fallback as on start; safe to run in parallel per photo. */
async function preparePhotoDataUrlForHandoff(
    photo: SelectedPhoto & { diagnosisSrc: string },
): Promise<string | null> {
    try {
        const raw = photo.diagnosisSrc.startsWith('data:image/')
            ? photo.diagnosisSrc
            : await readFileAsDataUrl(photo.file);
        return await compressImage(raw);
    } catch {
        try {
            return await readFileAsDataUrl(photo.file);
        } catch {
            return null;
        }
    }
}

async function normalizeSelectedPhoto(file: File): Promise<SelectedPhoto> {
    let raw = await readFileAsDataUrl(file);
    if (isHeicLike(file)) {
        const form = new FormData();
        form.set('file', file);
        const res = await fetch('/api/convert-heic', {
            method: 'POST',
            body: form,
        });
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

// ── Step 1 — Describe ──────────────────────────────────────────────────────────

function Step1({
    infoText,
    setInfoText,
    selectedService,
    isValidatingContinue,
    onContinue,
}: {
    infoText: string;
    setInfoText: (v: string) => void;
    selectedService: string | null;
    isValidatingContinue: boolean;
    onContinue: () => void | Promise<void>;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const t = setTimeout(() => ref.current?.focus(), 80);
        return () => clearTimeout(t);
    }, []);

    const trimmedLen = infoText.trim().length;
    const canContinue = trimmedLen >= START_DESCRIPTION_MIN_CHARS || Boolean(selectedService);

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
                    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto items-center">
                        <StepHeading
                            title="What's Happening"
                            sub="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis."
                        />

                        <div className="flex flex-col gap-3 w-full">
                            <div className="relative w-full">
                                <Textarea
                                    ref={ref}
                                    className="h-28 w-full resize-none"
                                    value={infoText}
                                    onChange={(e) => setInfoText(e.target.value)}
                                    disabled={isValidatingContinue}
                                />
                            </div>

                            <div className="text-xs text-muted-foreground text-center">
                                {canContinue ? (
                                    <span>You have entered {trimmedLen} characters, you can continue.</span>
                                ) : (
                                    <span>
                                        We require at least {START_DESCRIPTION_MIN_CHARS - trimmedLen} more characters to continue.
                                    </span>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
                <div className="sticky bottom-0 shrink-0 bg-background px-6 py-3">
                    <div className="w-full max-w-sm mx-auto">
                        <Button
                            type="button"
                            className="h-10 w-full gap-2"
                            onClick={() => void onContinue()}
                            disabled={!canContinue || isValidatingContinue}
                        >
                            {isValidatingContinue ? (
                                <>
                                    <CircleNotch className="size-4 animate-spin shrink-0" aria-hidden />
                                    Processing
                                </>
                            ) : (
                                'Continue'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Step 2 — Photo ─────────────────────────────────────────────────────────────

function Step2({
    selectedPhotos,
    setSelectedPhotos,
    onNext,
}: {
    selectedPhotos: SelectedPhoto[];
    setSelectedPhotos: React.Dispatch<React.SetStateAction<SelectedPhoto[]>>;
    onNext: () => void;
}) {
    const MAX_PHOTOS = 10;
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const hasPendingPhotos = selectedPhotos.some((photo) => photo.status === 'pending');

    const handleSelectPhotos = () => {
        uploadInputRef.current?.click();
    };

    const handlePhotosSelected = async (incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return;
        const files = Array.from(incoming).filter(
            (file) => file.type.startsWith('image/') || isHeicLike(file),
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
        const pendingIdsByFile = new Map(queuedPlaceholders.map((photo) => [photo.file, photo.id]));
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
                    prev.map((photo) =>
                        photo.id === id
                            ? {
                                  ...normalized,
                                  id,
                              }
                            : photo,
                    ),
                );
            } catch {
                if (isHeicLike(file)) {
                    setSelectedPhotos((prev) =>
                        prev.map((photo) =>
                            photo.id === id
                                ? {
                                      ...photo,
                                      status: 'error',
                                      previewSrc: null,
                                      diagnosisSrc: null,
                                      errorMessage: 'Could not convert this HEIC image.',
                                  }
                                : photo,
                        ),
                    );
                    continue;
                }
                try {
                    const fallbackSrc = await readFileAsDataUrl(file);
                    setSelectedPhotos((prev) =>
                        prev.map((photo) =>
                            photo.id === id
                                ? {
                                      ...photo,
                                      status: 'ready',
                                      previewSrc: fallbackSrc,
                                      diagnosisSrc: fallbackSrc,
                                      errorMessage: undefined,
                                  }
                                : photo,
                        ),
                    );
                } catch {
                    setSelectedPhotos((prev) =>
                        prev.map((photo) =>
                            photo.id === id
                                ? {
                                      ...photo,
                                      status: 'error',
                                      previewSrc: null,
                                      diagnosisSrc: null,
                                      errorMessage: 'Could not process this image.',
                                  }
                                : photo,
                        ),
                    );
                }
            }
        }
    };

    const handleRemovePhoto = (photoId: string) => {
        setSelectedPhotos((prev) => {
            const target = prev.find((photo) => photo.id === photoId);
            if (target?.previewSrc?.startsWith('blob:')) {
                URL.revokeObjectURL(target.previewSrc);
            }
            return prev.filter((photo) => photo.id !== photoId);
        });
    };

    const handleRetryPhoto = async (photoId: string) => {
        const target = selectedPhotos.find((photo) => photo.id === photoId);
        if (!target) return;
        setSelectedPhotos((prev) =>
            prev.map((photo) =>
                photo.id === photoId
                    ? {
                          ...photo,
                          status: 'pending',
                          previewSrc: null,
                          diagnosisSrc: null,
                          errorMessage: undefined,
                      }
                    : photo,
            ),
        );
        try {
            const normalized = await normalizeSelectedPhoto(target.file);
            setSelectedPhotos((prev) =>
                prev.map((photo) =>
                    photo.id === photoId
                        ? {
                              ...normalized,
                              id: photoId,
                          }
                        : photo,
                ),
            );
        } catch {
            setSelectedPhotos((prev) =>
                prev.map((photo) =>
                    photo.id === photoId
                        ? {
                              ...photo,
                              status: 'error',
                              previewSrc: null,
                              diagnosisSrc: null,
                              errorMessage: isHeicLike(photo.file)
                                  ? 'Could not convert this HEIC image.'
                                  : 'Could not process this image.',
                          }
                        : photo,
                ),
            );
        }
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
                    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
                        <input
                            ref={uploadInputRef}
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                                handlePhotosSelected(e.target.files);
                                e.currentTarget.value = '';
                            }}
                        />
                    <StepHeading
                            title="Add Photos"
                            sub="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis."
                    />

                        <div className="flex flex-col gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                onClick={handleSelectPhotos}
                                disabled={selectedPhotos.length >= MAX_PHOTOS}
                            >
                                Select Photos
                            </Button>
                            <p className="text-xs text-muted-foreground text-center">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis.
                            </p>
                        </div>

                        {selectedPhotos.length > 0 ? (
                            <div className="-mx-6">
                                <div className="flex gap-3 overflow-x-auto px-6 pb-1">
                                    {selectedPhotos.map((photo) => (
                                        <div
                                            key={photo.id}
                                            className="relative w-36 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
                                    >
                                            {photo.status === 'ready' && photo.previewSrc ? (
                                                <>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={photo.previewSrc}
                                                        alt={photo.file.name || ''}
                                                        className="h-36 w-full object-cover"
                                                    />
                                                    <Badge
                                                        onClick={() => handleRemovePhoto(photo.id)}
                                                        className="absolute top-2 right-2 bg-background text-foreground"
                                                    >
                                                        Remove
                                                    </Badge>
                                                </>
                                            ) : photo.status === 'pending' ? (
                                                <div className="flex h-36 w-full flex-col items-center justify-center bg-secondary px-3 text-center">
                                                    <CircleNotch className="mb-2 size-5 animate-spin text-muted-foreground" />
                                                    <p className="line-clamp-2 text-xs text-muted-foreground">
                                                        {photo.file.name}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex h-36 w-full flex-col items-center justify-center gap-2 bg-secondary px-3 text-center">
                                                    <p className="line-clamp-2 text-xs text-muted-foreground">
                                                        {photo.errorMessage ?? 'Could not process this image.'}
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => void handleRetryPhoto(photo.id)}
                                                        >
                                                            Retry
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemovePhoto(photo.id)}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        ) : null}
                    </div>
                </div>
                <div className="sticky bottom-0 shrink-0 bg-background px-6 py-3">
                    <div className="w-full max-w-sm mx-auto">
                        {selectedPhotos.length > 0 ? (
                            <Button
                                type="button"
                                className="h-10 w-full"
                                onClick={onNext}
                                disabled={hasPendingPhotos}
                            >
                                Continue
                            </Button>
                    ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-10 w-full text-muted-foreground"
                                onClick={onNext}
                            >
                                No, Continue Without Photos
                        </Button>
                    )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Step 3 — Location ──────────────────────────────────────────────────────────

function Step3({
    locationMode,
    setLocationMode,
    locationValue,
    setLocationValue,
    isGettingLocation,
    locationInputRef,
    onGetCurrentLocation,
    onStart,
    isStarting,
}: {
    locationMode: LocationMode;
    setLocationMode: (m: LocationMode) => void;
    locationValue: string;
    setLocationValue: (v: string) => void;
    isGettingLocation: boolean;
    locationInputRef: React.RefObject<HTMLInputElement | null>;
    onGetCurrentLocation: () => Promise<void>;
    onStart: () => Promise<void>;
    isStarting: boolean;
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
            (locationInputRef as React.MutableRefObject<HTMLInputElement | null>).current =
                manualRef.current;
        }
    }, [locationMode, locationInputRef]);

    const canStart =
        !isStarting &&
        (locationMode === 'gps-done' ||
            (locationMode === 'manual' && locationValue.trim().length > 0));

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex min-h-full flex-col">
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 min-h-0">
                    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
                    {locationMode === 'manual' ? (
                        <>
                            <StepHeading
                                title="Where's the Property?"
                                sub="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis."
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
                                className="mt-6 cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:underline"
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
                                sub="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis."
                            />

                            <Button
                                variant="secondary"
                                className="h-10 w-full"
                                    disabled={isGettingLocation}
                                    onClick={async () => {
                                        setLocationMode('gps-loading');
                                        await onGetCurrentLocation();
                                    }}
                            >
                                {isGettingLocation ? 'Getting Location...' : 'Get Current Location'}
                            </Button>

                            <Separator />

                            <div className="flex flex-col gap-3">
                                <Label>Search Locations</Label>
                                <Input
                                    ref={locationInputRef}
                                    className="h-10 w-full"
                                    value={locationValue}
                                    onChange={(e) => setLocationValue(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc quis arcu at velit cursus mollis.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
                <div className="sticky bottom-0 shrink-0 bg-background px-6 py-3">
                <div className="w-full max-w-sm mx-auto">
                        {canStart ? (
                            <Button
                                className="h-10 w-full"
                                disabled={isStarting}
                        onClick={() => void onStart()}
                    >
                        {isStarting ? 'Starting...' : 'Start Diagnosis'}
                            </Button>
                        ) : (
                            <Button type="button" variant="ghost" className="h-10 w-full text-muted-foreground">
                                No, Continue Without Contractors
                            </Button>
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

    const [infoText, setInfoText] = useState('');
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [serviceOptions, setServiceOptions] = useState<string[]>(() => [...SERVICE_LABELS]);

    const [locationValue, setLocationValue] = useState('');
    const [locationMode, setLocationMode] = useState<LocationMode>('choose');
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const locationInputRef = useRef<HTMLInputElement | null>(null);
    const autocompleteRef = useRef<{ remove: () => void } | null>(null);

    const [isStarting, setIsStarting] = useState(false);
    const [isStep1Validating, setIsStep1Validating] = useState(false);
    useEffect(() => {
        document.documentElement.classList.add('start-overflow-lock');
        document.body.classList.add('start-overflow-lock');
        return () => {
            document.documentElement.classList.remove('start-overflow-lock');
            document.body.classList.remove('start-overflow-lock');
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/service-catalog', { credentials: 'same-origin' });
                const body = (await res.json().catch(() => null)) as { labels?: unknown } | null;
                const labels = Array.isArray(body?.labels)
                    ? body!.labels
                          .map((x) => (typeof x === 'string' ? x.trim() : ''))
                          .filter((x) => x.length > 0)
                    : [];
                if (!cancelled && labels.length > 0) {
                    setServiceOptions(labels);
                }
            } catch {
                // Keep static fallback labels if catalog fetch fails.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleStep1Continue = useCallback(async () => {
        const trimmed = infoText.trim();
        const selected = (selectedService ?? '').trim();
        if (trimmed.length < START_DESCRIPTION_MIN_CHARS && !selected) return;
        if (selected) {
            setStep(2);
            return;
        }

        setIsStep1Validating(true);
        try {
            const res = await fetch('/api/validate-start-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: trimmed }),
            });
            const json = (await res.json().catch(() => null)) as
                | { ok?: boolean; message?: string; error?: string }
                | null;

            if (!res.ok) {
                toast.error(
                    typeof json?.message === 'string'
                        ? json.message
                        : typeof json?.error === 'string'
                          ? json.error
                          : 'Could not validate your description. Try again shortly.',
                );
                return;
            }

            if (json?.ok !== true) {
                toast.error(
                    typeof json?.message === 'string'
                        ? json.message
                        : 'Describe the problem more clearly — we cannot use that text yet.',
                );
                return;
            }

            setStep(2);
        } catch {
            toast.error('Network error while checking your description. Please try again.');
        } finally {
            setIsStep1Validating(false);
        }
    }, [infoText, selectedService]);

    useEffect(() => {
        if (step !== 3 || locationMode !== 'manual') return;
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
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, locationMode]);

    const geocodeInWesternCape = async (payload: {
        address?: string;
        lat?: number;
        lng?: number;
    }) => {
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, westernCapeOnly: true }),
            });
            const data = (await res.json().catch(() => null)) as {
                address?: string;
                error?: string;
            } | null;
            if (!res.ok) return { address: null, error: data?.error || WESTERN_CAPE_ERROR };
            return {
                address:
                    typeof data?.address === 'string' && data.address.trim()
                        ? data.address.trim()
                        : null,
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
                pos = await getPos({
                    enableHighAccuracy: false,
                    timeout: 20000,
                    maximumAge: 300000,
                });
            }
            const result = await geocodeInWesternCape({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
            });
            if (!result.address) {
                toast.error(WESTERN_CAPE_ERROR);
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

    const handleStartDiagnosis = useCallback(async () => {
        if (!locationValue.trim()) return;
        if (infoText.trim().length < START_DESCRIPTION_MIN_CHARS && !(selectedService ?? '').trim()) {
            toast.error(
                `Either add at least ${START_DESCRIPTION_MIN_CHARS} characters about the issue or select a service.`
            );
            setStep(1);
            return;
        }
        setIsStarting(true);
        try {
            const conversationId = createClientId();
            const readyPhotos = selectedPhotos.filter(
                (photo): photo is SelectedPhoto & { diagnosisSrc: string } =>
                    photo.status === 'ready' && typeof photo.diagnosisSrc === 'string',
            );
            const preparedPairs =
                readyPhotos.length > 0
                    ? (
                          await Promise.all(
                              readyPhotos.map(async (photo) => ({
                                  photo,
                                  dataUrl: await preparePhotoDataUrlForHandoff(photo),
                              })),
                          )
                      ).filter(
                          (x): x is { photo: (typeof readyPhotos)[0]; dataUrl: string } =>
                              x.dataUrl !== null && x.dataUrl.trim().length > 0,
                      )
                    : [];
            if (readyPhotos.length > 0 && preparedPairs.length === 0) {
                toast.error('Could not process the selected image. Please reselect the photo.');
            }
            const primaryPair = preparedPairs[0];
            if (primaryPair) {
                setImageData(conversationId, primaryPair.dataUrl, primaryPair.photo.file.name);
            }
            // Keep handoff bounded so session storage quota is less likely to fail.
            const uploadedImageSources = preparedPairs.map((p) => p.dataUrl).slice(0, 5);
            setPendingDiagnosisImages(conversationId, uploadedImageSources);

            if (uploadedImageSources[0]) {
                try {
                    sessionStorage.setItem(
                        `pending_diagnosis_image_url:${conversationId}`,
                        uploadedImageSources[0],
                    );
                } catch {
                }
            }

            let listToPersist = [...uploadedImageSources];
            while (listToPersist.length > 0) {
                try {
                    sessionStorage.setItem(
                        `pending_diagnosis_image_urls:${conversationId}`,
                        JSON.stringify(listToPersist),
                    );
                    break;
                } catch {
                    listToPersist = listToPersist.slice(0, -1);
                }
            }
            if (listToPersist.length === 0 && uploadedImageSources.length > 0) {
            }

            try {
                const trimmed = infoText.trim();
                if (trimmed) {
                    sessionStorage.setItem(
                        `pending_diagnosis_prompt:${conversationId}`,
                        trimmed,
                    );
                }
                const selected = (selectedService ?? '').trim();
                if (selected && serviceOptions.some((label) => label.toLowerCase() === selected.toLowerCase())) {
                    sessionStorage.setItem(
                        `pending_diagnosis_trade:${conversationId}`,
                        selected,
                    );
                }
            } catch {
                // Continue — processing page will surface missing prompt if needed.
            }

            try {
                sessionStorage.setItem(
                    `pending_diagnosis_location:${conversationId}`,
                    locationValue.trim(),
                );
            } catch {
                // Location may be missing; processing page can still run diagnosis flow.
            }
            const qp = new URLSearchParams();
            qp.set('location', locationValue.trim());
            const suffix = qp.toString() ? `?${qp.toString()}` : '';
            router.push(`/processing/${encodeURIComponent(conversationId)}${suffix}`);
        } catch {
            toast.error('Could not start diagnosis. Please try again.');
        } finally {
            setIsStarting(false);
        }
    }, [locationValue, infoText, router, selectedPhotos, selectedService, serviceOptions]);

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

            {/* step wrapper — overflow-hidden stops inner content escaping the viewport */}
            <div className="flex-1 overflow-hidden">
                {step === 1 && (
                    <Step1
                        infoText={infoText}
                        setInfoText={setInfoText}
                        selectedService={selectedService}
                        isValidatingContinue={isStep1Validating}
                        onContinue={handleStep1Continue}
                    />
                )}
                {step === 2 && (
                    <Step2
                        selectedPhotos={selectedPhotos}
                        setSelectedPhotos={setSelectedPhotos}
                        onNext={() => setStep(3)}
                    />
                )}
                {step === 3 && (
                    <Step3
                        locationMode={locationMode}
                        setLocationMode={setLocationMode}
                        locationValue={locationValue}
                        setLocationValue={setLocationValue}
                        isGettingLocation={isGettingLocation}
                        locationInputRef={locationInputRef}
                        onGetCurrentLocation={handleGetCurrentLocation}
                        onStart={handleStartDiagnosis}
                        isStarting={isStarting}
                    />
                )}
            </div>
        </div>
    );
}
