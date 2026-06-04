import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import type { GalleryDraftItem, GalleryImage } from '../lib/types';
import { galleryImageSourceLabel } from '../lib/gallery';

export function ProGalleryTab(props: {
    resolvedProviderId: string | null;
    galleryUploading: boolean;
    galleryAddOpen: boolean;
    setGalleryAddOpen: React.Dispatch<React.SetStateAction<boolean>>;
    galleryDraftItems: GalleryDraftItem[];
    setGalleryDraftItems: React.Dispatch<React.SetStateAction<GalleryDraftItem[]>>;
    galleryModalError: string | null;
    setGalleryModalError: React.Dispatch<React.SetStateAction<string | null>>;
    galleryModalSuccess: boolean;
    setGalleryModalSuccess: React.Dispatch<React.SetStateAction<boolean>>;
    galleryModalInputRef: React.RefObject<HTMLInputElement | null>;
    handleGalleryModalFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
    openGalleryAddDialog: () => void;
    isGalleryLoading: boolean;
    isSyncingGoogleGallery: boolean;
    galleryGridImages: GalleryImage[];
    galleryImages: GalleryImage[];
    setLightbox: React.Dispatch<React.SetStateAction<{ url: string; caption: string | null } | null>>;
    removeGalleryDraftItem: (id: string) => void;
    updateGalleryDraftCaption: (id: string, caption: string) => void;
    handleGalleryModalSubmit: (e: React.FormEvent) => Promise<void>;
    lightbox: { url: string; caption: string | null } | null;
}) {
    const {
        resolvedProviderId,
        galleryUploading,
        galleryAddOpen,
        setGalleryAddOpen,
        galleryDraftItems,
        setGalleryDraftItems,
        galleryModalError,
        setGalleryModalError,
        galleryModalSuccess,
        setGalleryModalSuccess,
        galleryModalInputRef,
        handleGalleryModalFiles,
        openGalleryAddDialog,
        isGalleryLoading,
        isSyncingGoogleGallery,
        galleryGridImages,
        galleryImages,
        setLightbox,
        removeGalleryDraftItem,
        updateGalleryDraftCaption,
        handleGalleryModalSubmit,
        lightbox,
    } = props;

    return (
        <div className="flex flex-col gap-6 mt-2">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg text-foreground font-bold">Gallery</h3>
                <p className="text-sm text-foreground">
                    Browse recent job photos, completed work, and before-and-after examples to get a feel for quality before you contact this pro.
                </p>
            </div>

            <input
                ref={galleryModalInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleGalleryModalFiles}
            />

            <Button
                type="button"
                variant="secondary"
                className="h-10 w-full"
                disabled={!resolvedProviderId || galleryUploading}
                onClick={openGalleryAddDialog}
            >
                Share Images
            </Button>

            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                    {isGalleryLoading || isSyncingGoogleGallery
                        ? Array.from({ length: 6 }).map((_, i) => (
                              <Skeleton key={i} className="aspect-square rounded-xl" />
                          ))
                        : galleryGridImages.length > 0
                          ? galleryGridImages.map((img) => (
                                <button
                                    key={img.id}
                                    type="button"
                                    className="group relative aspect-square overflow-hidden rounded-xl bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => setLightbox({ url: img.url, caption: img.caption })}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={img.url}
                                        alt={img.caption || 'Gallery image'}
                                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                    />
                                    <Badge
                                        variant="outline"
                                        className="pointer-events-none absolute bottom-2 right-2 bg-background"
                                    >
                                        {galleryImageSourceLabel(img.source, img.path)}
                                    </Badge>
                                </button>
                            ))
                          : galleryImages.length > 0 ? (
                                <p className="col-span-full text-sm text-muted-foreground">
                                    The first image is your banner. More images will show here when you have
                                    additional photos.
                                </p>
                            ) : (
                                <p className="col-span-full text-sm text-muted-foreground">
                                    No approved images yet. Add your own above (they stay pending until approved), or wait
                                    for Google images to sync when available.
                                </p>
                            )}
                </div>
            </div>

            <Dialog
                open={galleryAddOpen}
                onOpenChange={(open) => {
                    setGalleryAddOpen(open);
                    if (!open) {
                        setGalleryDraftItems((prev) => {
                            prev.forEach((p) => URL.revokeObjectURL(p.preview));
                            return [];
                        });
                        setGalleryModalError(null);
                        setGalleryModalSuccess(false);
                    }
                }}
            >
                <DialogContent
                    showCloseButton={false}
                    className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg"
                >
                    <form onSubmit={handleGalleryModalSubmit} className="flex flex-col gap-6">
                        <DialogHeader className="text-left gap-3">
                            <DialogTitle className="text-left leading-none">Share Images</DialogTitle>
                            <DialogDescription>
                                Add clear photos of completed work to help homeowners understand your quality, style, and scope of services.
                            </DialogDescription>
                        </DialogHeader>

                        <Button
                            variant="secondary"
                            className="h-10 w-full"
                            disabled={galleryUploading}
                            onClick={() => galleryModalInputRef.current?.click()}
                        >
                            Select Images
                        </Button>

                        {galleryDraftItems.length > 0 ? (
                            <div className="flex flex-col gap-6">
                                {galleryDraftItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex flex-col gap-4 rounded-lg border border-border/75 p-4"
                                    >
                                        <div className="w-full overflow-hidden rounded-md bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={item.preview}
                                                alt=""
                                                className="max-h-52 w-full object-cover"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor={`cap-${item.id}`}>Caption</Label>
                                            <Textarea
                                                id={`cap-${item.id}`}
                                                value={item.caption}
                                                onChange={(e) =>
                                                    updateGalleryDraftCaption(item.id, e.target.value)
                                                }
                                                className="min-h-[48px] resize-y text-sm"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="h-10 w-full shrink-0"
                                            onClick={() => removeGalleryDraftItem(item.id)}
                                        >
                                            Remove Image
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {galleryModalError ? (
                            <p className="text-sm text-destructive">{galleryModalError}</p>
                        ) : null}
                        {galleryModalSuccess ? (
                            <p className="text-sm text-foreground">
                                Thanks — your images were submitted and will appear after moderation.
                            </p>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                className="h-10 min-h-10 flex-1"
                                variant="ghost"
                                onClick={() => setGalleryAddOpen(false)}
                                disabled={galleryUploading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="h-10 min-h-10 flex-1"
                                disabled={
                                    galleryUploading ||
                                    !resolvedProviderId ||
                                    galleryDraftItems.length === 0 ||
                                    galleryModalSuccess
                                }
                            >
                                {galleryUploading ? 'Submitting…' : 'Share Review'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
                <DialogContent
                    showCloseButton={false}
                    className="max-w-[min(100vw-2rem,56rem)] border border-border bg-background p-4"
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>Image preview</DialogTitle>
                        <DialogDescription>Preview of selected gallery image</DialogDescription>
                    </DialogHeader>
                    {lightbox ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex w-full flex-row justify-end">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-10 w-10 shrink-0"
                                    onClick={() => setLightbox(null)}
                                    aria-label="Close"
                                >
                                    <X className="size-5" />
                                </Button>
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={lightbox.url}
                                alt={lightbox.caption || 'Gallery preview'}
                                className="max-h-[min(80vh,720px)] w-full rounded-md object-contain"
                            />
                            {lightbox.caption ? (
                                <p className="text-left text-sm text-muted-foreground">{lightbox.caption}</p>
                            ) : null}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
