'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { createClientId } from '@/lib/client-random-id';
import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import type { GalleryDraftItem, UploadedImage } from './types';

export function StepGallery() {
    const { uploads, setUploads, data } = useWizard();
    const contractorType = data.contractorType;
    const [galleryAddOpen, setGalleryAddOpen] = useState(false);
    const [galleryDraftItems, setGalleryDraftItems] = useState<GalleryDraftItem[]>([]);
    const [galleryUploading, setGalleryUploading] = useState(false);
    const [galleryModalError, setGalleryModalError] = useState<string | null>(null);
    const galleryModalInputRef = useRef<HTMLInputElement>(null);

    const removeGalleryDraftItem = (id: string) => {
        setGalleryDraftItems((prev) => {
            const item = prev.find((p) => p.id === id);
            if (item) URL.revokeObjectURL(item.preview);
            return prev.filter((p) => p.id !== id);
        });
    };

    const updateGalleryDraftCaption = (id: string, caption: string) => {
        setGalleryDraftItems((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
    };

    const handleGalleryModalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list?.length) return;
        setGalleryModalError(null);
        setGalleryDraftItems((prev) => {
            const next = [...prev];
            for (const file of Array.from(list)) {
                if (!file.type.startsWith('image/')) continue;
                next.push({
                    id: createClientId(),
                    file,
                    caption: '',
                    preview: URL.createObjectURL(file),
                });
            }
            return next;
        });
        e.target.value = '';
    };

    const handleGalleryModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (galleryDraftItems.length === 0) return;
        setGalleryUploading(true);
        setGalleryModalError(null);
        try {
            const fd = new FormData();
            for (const item of galleryDraftItems) {
                fd.append('files', item.file);
            }
            const res = await fetch('/api/providers/application-images', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as {
                images?: Array<{ path: string; bucket: string }>;
                error?: string;
            } | null;
            if (!res.ok || !json?.images?.length) {
                setGalleryModalError(json?.error || 'Upload failed.');
                return;
            }
            const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const fresh: UploadedImage[] = json.images.map((item, i) => ({
                id: createClientId(),
                path: item.path,
                bucket: item.bucket,
                caption: galleryDraftItems[i]?.caption.trim() || null,
                previewUrl: `${base}/storage/v1/object/public/${item.bucket}/${item.path}`,
            }));
            setUploads([...uploads, ...fresh]);
            setGalleryDraftItems((prev) => {
                prev.forEach((p) => URL.revokeObjectURL(p.preview));
                return [];
            });
            toast.success('Images queued for review.');
            setGalleryAddOpen(false);
        } finally {
            setGalleryUploading(false);
        }
    };

    const openGalleryAddDialog = () => {
        setGalleryDraftItems((prev) => {
            prev.forEach((p) => URL.revokeObjectURL(p.preview));
            return [];
        });
        setGalleryModalError(null);
        setGalleryAddOpen(true);
    };

    const removeUpload = (id: string) => setUploads(uploads.filter((u) => u.id !== id));

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Work photos"
                description={
                    contractorType === 'individual'
                        ? 'Show recent jobs if you have them — optional for solo applicants, but photos lift trust when homeowners compare you.'
                        : 'Add at least one photo of your work so we can review quality. More is better.'
                }
            />
            <input
                ref={galleryModalInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleGalleryModalFiles}
            />

            <div className="flex flex-col gap-4">
                <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full"
                    disabled={galleryUploading}
                    onClick={openGalleryAddDialog}
                >
                    Add work photos
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP or GIF — up to 10MB each.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {uploads.map((item) => (
                    <div key={item.id} className="rounded-lg border border-input p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.previewUrl}
                            alt={item.caption || 'Uploaded image'}
                            className="h-24 w-full rounded object-cover"
                        />
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.caption || 'No caption'}</p>
                        <Button
                            type="button"
                            variant="ghost"
                            className="mt-1 h-8 w-full"
                            onClick={() => removeUpload(item.id)}
                        >
                            Remove
                        </Button>
                    </div>
                ))}
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
                    }
                }}
            >
                <DialogContent showCloseButton={false} className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
                    <form onSubmit={(e) => void handleGalleryModalSubmit(e)} className="flex flex-col gap-6">
                        <DialogHeader className="gap-3 text-left">
                            <DialogTitle className="text-left leading-none">Add photos</DialogTitle>
                            <DialogDescription className="text-left text-muted-foreground">
                                Choose clear shots of finished work. Short captions help reviewers understand each job.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-4">
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={galleryUploading}
                                onClick={() => galleryModalInputRef.current?.click()}
                            >
                                Select images
                            </Button>
                        </div>

                        {galleryDraftItems.length > 0 ? (
                            <div className="flex flex-col gap-6">
                                {galleryDraftItems.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex flex-col gap-4 rounded-lg border border-border/75 p-4"
                                    >
                                        <div className="w-full overflow-hidden rounded-md bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={item.preview} alt="" className="max-h-52 w-full object-cover" />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor={`cap-${item.id}`}>Caption</Label>
                                            <Textarea
                                                id={`cap-${item.id}`}
                                                value={item.caption}
                                                onChange={(e) => updateGalleryDraftCaption(item.id, e.target.value)}
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

                        {galleryModalError ? <p className="text-sm text-destructive">{galleryModalError}</p> : null}

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
                                disabled={galleryUploading || galleryDraftItems.length === 0}
                            >
                                {galleryUploading ? 'Submitting…' : 'Share Review'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
