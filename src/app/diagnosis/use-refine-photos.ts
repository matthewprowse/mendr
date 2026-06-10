"use client";

/**
 * useRefinePhotos — Add Details ("refine") overlay photo upload state machine
 * and the Refresh Findings rescan handler.
 *
 * Extracted verbatim from client.tsx as a pure mechanical refactor: the hook
 * encapsulates exactly the contiguous run of hooks (four useCallback handlers
 * followed by three useEffects) that previously sat after the fullscreen
 * keyboard effect in DiagnosisPageClient, in the same order, with identical
 * effect dependencies. State stays in the composition root and is injected.
 *
 * Mirrors the /start uploader: stash a `pending` placeholder immediately, then
 * run HEIC conversion + compression in the background and patch the tile to
 * `ready` (or `error`). Uploads to Supabase storage happen in a separate
 * effect.
 */

import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { patchConversation } from "@/lib/diagnosis/diagnoses-api";
import type { Provider } from "@/lib/providers/types";
import {
    createSelectedPhotoId,
    isHeicLike,
    normalizeSelectedPhoto,
    readFileAsDataUrl,
    uploadPhotoToStorage,
    type SelectedPhoto,
} from "@/lib/diagnosis/photo-upload";
import { REFINE_MAX_TOTAL_PHOTOS, providerHydrateSessionKey } from "./diagnosis-helpers";
import type { RunInitialDiagnosis } from "./use-diagnosis-stream";

/** Structural ref type — matches the object returned by `useRef`. */
type MutableRef<T> = { current: T };

type UseRefinePhotosParams = {
    conversationId?: string;
    showAddInfoScreen: boolean;
    infoText: string;
    imageSrc: string | null;
    selectedTradeHint: string;
    customerInfoItems: string[];
    uploadedImageSources: string[];
    refinePhotos: SelectedPhoto[];
    refinePhotoStorageUrls: Record<string, string>;
    removedOriginalUrls: Set<string>;
    // Refs (owned by the composition root)
    refineUploadInputRef: MutableRef<HTMLInputElement | null>;
    uploadedImageSourcesRef: MutableRef<string[]>;
    removedOriginalUrlsRef: MutableRef<Set<string>>;
    providersForDiagnoseRef: MutableRef<Provider[]>;
    didRunDiagnosisRef: MutableRef<string | null>;
    // State setters (owned by the composition root)
    setRefinePhotos: Dispatch<SetStateAction<SelectedPhoto[]>>;
    setRefinePhotoStorageUrls: Dispatch<SetStateAction<Record<string, string>>>;
    setRemovedOriginalUrls: Dispatch<SetStateAction<Set<string>>>;
    setShowAddInfoScreen: Dispatch<SetStateAction<boolean>>;
    setDiagnosisFailureMessage: Dispatch<SetStateAction<string | null>>;
    setCustomerInfoItems: Dispatch<SetStateAction<string[]>>;
    setInfoText: Dispatch<SetStateAction<string>>;
    setUploadedImageSources: Dispatch<SetStateAction<string[]>>;
    setImageSrc: Dispatch<SetStateAction<string | null>>;
    setDiagnosisTitle: Dispatch<SetStateAction<string>>;
    runInitialDiagnosis: RunInitialDiagnosis;
};

export function useRefinePhotos({
    conversationId,
    showAddInfoScreen,
    infoText,
    imageSrc,
    selectedTradeHint,
    customerInfoItems,
    uploadedImageSources,
    refinePhotos,
    refinePhotoStorageUrls,
    removedOriginalUrls,
    refineUploadInputRef,
    uploadedImageSourcesRef,
    removedOriginalUrlsRef,
    providersForDiagnoseRef,
    didRunDiagnosisRef,
    setRefinePhotos,
    setRefinePhotoStorageUrls,
    setRemovedOriginalUrls,
    setShowAddInfoScreen,
    setDiagnosisFailureMessage,
    setCustomerInfoItems,
    setInfoText,
    setUploadedImageSources,
    setImageSrc,
    setDiagnosisTitle,
    runInitialDiagnosis,
}: UseRefinePhotosParams) {
    const handleRefineSelectPhotos = useCallback(() => {
        refineUploadInputRef.current?.click();
    }, []);

    const handleRefinePhotosSelected = useCallback(
        async (incoming: FileList | null) => {
            if (!incoming || incoming.length === 0) return;
            const files = Array.from(incoming).filter(
                (f) => f.type.startsWith("image/") || isHeicLike(f),
            );
            if (files.length === 0) return;
            const existingTotal =
                uploadedImageSourcesRef.current.filter(
                    (u) => !removedOriginalUrlsRef.current.has(u),
                ).length + refinePhotos.length;
            const remaining = Math.max(0, REFINE_MAX_TOTAL_PHOTOS - existingTotal);
            if (remaining === 0) {
                toast.error(
                    `You can attach at most ${REFINE_MAX_TOTAL_PHOTOS} photos in total.`,
                );
                return;
            }
            const filesToQueue = files.slice(0, remaining);
            const placeholders = filesToQueue.map((file) => ({
                id: createSelectedPhotoId(),
                file,
                status: "pending" as const,
                previewSrc: null,
                diagnosisSrc: null,
            }));
            const pendingIdsByFile = new Map(placeholders.map((p) => [p.file, p.id]));
            setRefinePhotos((prev) => [...prev, ...placeholders]);
            for (const file of filesToQueue) {
                const id = pendingIdsByFile.get(file);
                if (!id) continue;
                try {
                    const normalized = await normalizeSelectedPhoto(file);
                    setRefinePhotos((prev) =>
                        prev.map((p) =>
                            p.id === id
                                ? {
                                      ...normalized,
                                      id,
                                      file: normalized.file,
                                  }
                                : p,
                        ),
                    );
                } catch {
                    // Fall back to a raw data URL so the photo isn't lost on
                    // a transient HEIC-conversion failure — same pattern as
                    // /start. If even that fails, surface an error tile.
                    try {
                        const fallbackSrc = await readFileAsDataUrl(file);
                        setRefinePhotos((prev) =>
                            prev.map((p) =>
                                p.id === id
                                    ? {
                                          ...p,
                                          status: "ready",
                                          previewSrc: fallbackSrc,
                                          diagnosisSrc: fallbackSrc,
                                          errorMessage: undefined,
                                      }
                                    : p,
                            ),
                        );
                    } catch {
                        setRefinePhotos((prev) =>
                            prev.map((p) =>
                                p.id === id
                                    ? {
                                          ...p,
                                          status: "error",
                                          previewSrc: null,
                                          diagnosisSrc: null,
                                          errorMessage: isHeicLike(p.file)
                                              ? "Could not convert this HEIC image."
                                              : "Could not process this image.",
                                      }
                                    : p,
                            ),
                        );
                    }
                }
            }
        },
        [refinePhotos.length],
    );

    const handleRefineRemovePhoto = useCallback((photoId: string) => {
        setRefinePhotos((prev) => prev.filter((p) => p.id !== photoId));
        setRefinePhotoStorageUrls((prev) => {
            const next = { ...prev };
            delete next[photoId];
            return next;
        });
    }, []);

    // Stage an existing diagnosis photo for removal. Commits on re-run.
    const handleRemoveExistingPhoto = useCallback((url: string) => {
        setRemovedOriginalUrls((prev) => {
            const next = new Set(prev);
            next.add(url);
            return next;
        });
    }, []);

    // Mirror removal state into a ref so the upload handler can read the
    // freed-slot count without a stale closure.
    useEffect(() => {
        removedOriginalUrlsRef.current = removedOriginalUrls;
    }, [removedOriginalUrls]);

    // Reset staged removals each time the Add Details overlay opens, so an
    // earlier cancelled edit does not carry over.
    useEffect(() => {
        if (showAddInfoScreen) setRemovedOriginalUrls(new Set());
    }, [showAddInfoScreen]);

    // Upload each `ready` refine photo to storage once. Mirrors the effect in
    // /start that uploads on `ready` if a hosted URL doesn't yet exist.
    useEffect(() => {
        if (!conversationId) return;
        for (const photo of refinePhotos) {
            if (photo.status === "ready" && !refinePhotoStorageUrls[photo.id]) {
                void uploadPhotoToStorage(photo.file, conversationId).then((url) => {
                    if (url) {
                        setRefinePhotoStorageUrls((prev) => ({
                            ...prev,
                            [photo.id]: url,
                        }));
                    }
                });
            }
        }
    }, [refinePhotos, refinePhotoStorageUrls, conversationId]);

    const handleRescanReport = async () => {
        const trimmed = infoText.trim();
        // Refine can be "I'm adding text", "I'm adding photos", or "I'm
        // removing photos" — allow rescan when any of those changed.
        const readyNewPhotos = refinePhotos.filter((p) => p.status === "ready");
        const newPhotoUrls = readyNewPhotos
            .map((p) => refinePhotoStorageUrls[p.id])
            .filter((u): u is string => typeof u === "string" && u.length > 0);
        const hasRemovedPhotos = removedOriginalUrls.size > 0;
        if (!imageSrc) return;
        if (!trimmed && newPhotoUrls.length === 0 && !hasRemovedPhotos) return;

        // Refinement fair-use cap: the server increments refinement_count for this
        // diagnosis and returns 429 once the per-diagnosis limit is exceeded. Only
        // user-initiated refines (this handler) count, never clarifications.
        if (conversationId) {
            const capRes = await fetch("/api/diagnose/refinement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId }),
            }).catch(() => null);
            if (capRes && capRes.status === 429) {
                setShowAddInfoScreen(false);
                setDiagnosisFailureMessage(
                    "You have reached the refinement limit for this diagnosis. Start a new one to continue.",
                );
                return;
            }
        }

        setShowAddInfoScreen(false);

        const nextItems = trimmed ? [...customerInfoItems, trimmed] : customerInfoItems;
        const joinedInfo = nextItems.join("\n\n").trim();
        setCustomerInfoItems(nextItems);
        setInfoText("");

        // Append new photo URLs (deduped) to the existing photo list. The
        // diagnose pipeline caps at 4 — we already enforce that in the upload
        // handler, but slice defensively here too.
        const keptOriginals = uploadedImageSources.filter((u) => !removedOriginalUrls.has(u));
        const combinedPhotoSources = [
            ...keptOriginals,
            ...newPhotoUrls.filter((u) => !keptOriginals.includes(u)),
        ].slice(0, REFINE_MAX_TOTAL_PHOTOS);
        const photosChanged =
            combinedPhotoSources.length !== uploadedImageSources.length ||
            combinedPhotoSources.some((u, i) => u !== uploadedImageSources[i]);

        if (conversationId) {
            try {
                sessionStorage.removeItem(providerHydrateSessionKey(conversationId));
            } catch {
                /* ignore */
            }
            providersForDiagnoseRef.current = [];
            const noteSave = await patchConversation(conversationId, {
                initial_image_description: joinedInfo || null,
                ...(photosChanged ? { image_urls: combinedPhotoSources } : {}),
            });
            if (!noteSave.ok) {
                setDiagnosisFailureMessage(
                    noteSave.error || "We could not save your notes. Please try again.",
                );
                return;
            }
        }

        if (photosChanged) {
            setUploadedImageSources(combinedPhotoSources);
        }

        // Clear the refine-photo staging state — the photos are now part of
        // the canonical uploadedImageSources list.
        setRefinePhotos([]);
        setRefinePhotoStorageUrls({});
        setRemovedOriginalUrls(new Set());

        // If the hero photo was removed, promote the first remaining photo to
        // primary so the diagnosis still runs off a valid source image.
        const nextPrimary =
            imageSrc && combinedPhotoSources.includes(imageSrc)
                ? imageSrc
                : (combinedPhotoSources[0] ?? imageSrc);
        if (nextPrimary !== imageSrc) setImageSrc(nextPrimary);

        didRunDiagnosisRef.current = null;
        setDiagnosisTitle("Diagnosing…");
        setCustomerInfoItems(nextItems);
        await runInitialDiagnosis(
            nextPrimary,
            joinedInfo,
            selectedTradeHint.trim() || null,
            combinedPhotoSources,
        );
    };

    return {
        handleRefineSelectPhotos,
        handleRefinePhotosSelected,
        handleRefineRemovePhoto,
        handleRemoveExistingPhoto,
        handleRescanReport,
    };
}
