"use client";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { SelectedPhoto } from "@/lib/diagnosis/photo-upload";

// ── Photo tiles ──────────────────────────────────────────────────────────────
// Two tile components live here because their roles differ:
//   * `DiagnosisPhotoTile` is read-only — it renders the already-uploaded
//     photos that fed the current diagnosis and acts as the click target for
//     the existing full-screen carousel.
//   * `RefinePhotoTile` is used inside the Add Details overlay where new
//     photos go through the same `pending` → `ready` / `error` lifecycle the
//     /start uploader uses, plus a Remove button.
// Keeping them separate avoids the conditional sprawl that a single component
// would need, at the cost of a little markup duplication.

export function DiagnosisPhotoTile({
    src,
    index,
    showNumber,
    onOpen,
    onRemove,
    canRemove = true,
}: {
    /** Empty string renders a bg-secondary placeholder — used by mock mode
     *  and any case where the row is hydrating before image URLs land. */
    src: string;
    index: number;
    showNumber: boolean;
    onOpen?: () => void;
    /** When provided, the tile renders a removable variant (used in the Add
     *  Details overlay) instead of the full-screen-open button. */
    onRemove?: () => void;
    canRemove?: boolean;
}) {
    const hasImage = src.trim().length > 0;
    const wrapperCls = [
        "relative aspect-square overflow-hidden rounded-lg border border-border",
        hasImage ? "bg-background" : "bg-secondary",
    ].join(" ");
    const inner = (
        <>
            {hasImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={src}
                    alt={`Uploaded issue photo ${index + 1}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            ) : null}
            {showNumber ? (
                <Badge variant="count" className="absolute bottom-2 left-2">
                    {index + 1}
                </Badge>
            ) : null}
        </>
    );

    // Removable variant: a div wrapper with the same outline Remove badge that
    // RefinePhotoTile uses. Rendered as a div (not a button) so the Remove
    // button isn't nested inside another button. No full-screen open here.
    if (onRemove) {
        return (
            <div className={wrapperCls}>
                {inner}
                {canRemove ? (
                    <Badge asChild variant="outline">
                        <button
                            type="button"
                            className="absolute right-2 top-2 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
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

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={
                hasImage
                    ? `Open uploaded issue photo ${index + 1}`
                    : `Photo placeholder ${index + 1}`
            }
            className={wrapperCls}
        >
            {inner}
        </button>
    );
}

export function RefinePhotoTile({
    photo,
    index,
    showNumber,
    onRemove,
    canRemove = true,
}: {
    photo: SelectedPhoto;
    index: number;
    showNumber: boolean;
    onRemove: (photoId: string) => void;
    canRemove?: boolean;
}) {
    const isReady = photo.status === "ready" && photo.previewSrc;
    const wrapperCls = [
        "relative aspect-square overflow-hidden rounded-lg border border-border transition-all duration-150",
        isReady ? "bg-background" : "bg-secondary",
    ].join(" ");
    return (
        <div className={wrapperCls}>
            {isReady ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={photo.previewSrc!}
                    alt={photo.file.name || ""}
                    className="h-full w-full object-cover"
                    draggable={false}
                />
            ) : photo.status === "pending" ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center">
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                        {photo.errorMessage ?? "Could not process this image."}
                    </p>
                </div>
            )}
            {showNumber ? (
                <Badge variant="count" className="absolute bottom-2 left-2">
                    {index + 1}
                </Badge>
            ) : null}
            {isReady && canRemove ? (
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
