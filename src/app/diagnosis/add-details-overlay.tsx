"use client";

/**
 * Add Details overlay — aligned with /start design system.
 * Users can add a short note AND/OR attach extra photos (up to the 4-photo
 * shared cap). Either input alone is enough to enable Refresh Findings — the
 * text-length floor only applies when the user is going text-only.
 *
 * Extracted verbatim from client.tsx (it was an inline IIFE behind
 * `showAddInfoScreen && …`). Purely presentational: all state and handlers
 * are injected from the composition root, and the parent still controls
 * mounting, so behavior is unchanged.
 */

import type { Dispatch, SetStateAction } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlowTopBar, StepHeading } from "@/components/match/flow-shell";
import type { SelectedPhoto } from "@/lib/diagnosis/photo-upload";
import { MIN_DESCRIPTION_CHARS, REFINE_MAX_TOTAL_PHOTOS } from "./diagnosis-helpers";
import { DiagnosisPhotoTile, RefinePhotoTile } from "./photo-tiles";

/** Structural ref type — matches the object returned by `useRef`. */
type MutableRef<T> = { current: T };

export function AddDetailsOverlay({
    infoText,
    setInfoText,
    uploadedImageSources,
    removedOriginalUrls,
    refinePhotos,
    refineUploadInputRef,
    isDiagnosing,
    showSkeleton,
    onClose,
    onSelectPhotos,
    onPhotosSelected,
    onRemoveExistingPhoto,
    onRemoveRefinePhoto,
    onRescan,
}: {
    infoText: string;
    setInfoText: Dispatch<SetStateAction<string>>;
    uploadedImageSources: string[];
    removedOriginalUrls: Set<string>;
    refinePhotos: SelectedPhoto[];
    refineUploadInputRef: MutableRef<HTMLInputElement | null>;
    isDiagnosing: boolean;
    showSkeleton: boolean;
    onClose: () => void;
    onSelectPhotos: () => void;
    onPhotosSelected: (files: FileList | null) => Promise<void>;
    onRemoveExistingPhoto: (url: string) => void;
    onRemoveRefinePhoto: (photoId: string) => void;
    onRescan: () => Promise<void>;
}) {
    const refineReadyCount = refinePhotos.filter((p) => p.status === "ready").length;
    const refinePendingCount = refinePhotos.filter((p) => p.status === "pending").length;
    const keptOriginals = uploadedImageSources.filter((u) => !removedOriginalUrls.has(u));
    const totalPhotosAfter = keptOriginals.length + refinePhotos.length;
    const canAddMorePhotos = totalPhotosAfter < REFINE_MAX_TOTAL_PHOTOS;
    // One shared 1..N numbering across existing + new photos.
    // At least one photo must remain, so removal is disabled
    // once a single tile is left.
    const showTileNumbers = totalPhotosAfter > 1;
    const canRemoveAny = totalPhotosAfter > 1;
    // Mirror /start's add-photo placement: an odd tile count
    // gets a square "Add Photos" tile to fill the 2-col row, an
    // even count gets a full-width button below the grid.
    const addPhotosAsTile = canAddMorePhotos && totalPhotosAfter % 2 === 1;
    const addPhotosAsButton = canAddMorePhotos && totalPhotosAfter % 2 === 0;
    const hasNewText = infoText.trim().length >= MIN_DESCRIPTION_CHARS;
    const hasNewPhotos = refineReadyCount > 0;
    // Removing an existing photo is itself a change worth
    // re-running on, even with no new text or new photos.
    const hasRemovedPhotos = removedOriginalUrls.size > 0;
    const canRescan =
        (hasNewText || hasNewPhotos || hasRemovedPhotos) &&
        refinePendingCount === 0 &&
        !isDiagnosing &&
        !showSkeleton;
    return (
        <div className="absolute inset-0 z-[300] flex flex-col overflow-hidden bg-background">
            <FlowTopBar
                className="p-4"
                leftSlot={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Go back"
                        onClick={onClose}
                    >
                        <ArrowLeft strokeWidth={2.5} aria-hidden />
                    </Button>
                }
                centerSlot={
                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                        Add Details
                    </p>
                }
            />
            <input
                ref={refineUploadInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="sr-only"
                onChange={(e) => {
                    void onPhotosSelected(e.target.files);
                    e.currentTarget.value = "";
                }}
            />
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                <div className="my-auto flex w-full flex-col items-center p-4">
                    <div className="flex flex-col gap-8 w-full max-w-xl mx-auto">
                        <StepHeading
                            title="What Else Should We Know?"
                            sub="Add more photos or extra detail about the problem and we will refine the diagnosis to make it more accurate."
                        />

                        {totalPhotosAfter > 0 ? (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {keptOriginals.map((url, idx) => (
                                        <DiagnosisPhotoTile
                                            key={url}
                                            src={url}
                                            index={idx}
                                            showNumber={showTileNumbers}
                                            onRemove={() => onRemoveExistingPhoto(url)}
                                            canRemove={canRemoveAny}
                                        />
                                    ))}
                                    {refinePhotos.map((photo, idx) => (
                                        <RefinePhotoTile
                                            key={photo.id}
                                            photo={photo}
                                            index={keptOriginals.length + idx}
                                            showNumber={showTileNumbers}
                                            onRemove={onRemoveRefinePhoto}
                                            canRemove={canRemoveAny}
                                        />
                                    ))}
                                    {addPhotosAsTile ? (
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={onSelectPhotos}
                                            className="aspect-square h-auto w-full"
                                        >
                                            Add Photos
                                        </Button>
                                    ) : null}
                                </div>
                                {!canAddMorePhotos ? (
                                    <p className="text-center text-xs text-muted-foreground">
                                        You have added the most photos we can take, which is
                                        four.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        {addPhotosAsButton ? (
                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={onSelectPhotos}
                                >
                                    Add Photos
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Add up to four photos. Clear, well lit ones work best.
                                </p>
                            </div>
                        ) : null}

                        {/* Note input — mirrors /start's Problem
                        Description block exactly: Label + char
                        counter, default-height Textarea (no fixed
                        h-N), no placeholder, helper line below. */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="adjust-note">Problem Description</Label>
                                <span className="text-xs text-muted-foreground">
                                    {infoText.length} / 500
                                </span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Textarea
                                    id="adjust-note"
                                    autoFocus
                                    maxLength={500}
                                    value={infoText}
                                    onChange={(e) => setInfoText(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Tell us anything new you have noticed since the diagnosis.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="sticky bottom-0 shrink-0 bg-background p-4">
                <div className="w-full max-w-xl mx-auto">
                    <Button
                        type="button"
                        className="w-full"
                        disabled={!canRescan}
                        onClick={() => void onRescan()}
                    >
                        {isDiagnosing ? "Processing…" : "Refresh Findings"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
