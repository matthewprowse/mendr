'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Spinner } from '@/components/ui/spinner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type GalleryItem = { id: string; url: string; caption: string | null; pending: boolean };

export default function ManagePhotosClient({
    providerId,
    canEdit,
    images,
}: {
    providerId: string;
    canEdit: boolean;
    images: GalleryItem[];
}) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const list = e.target.files;
        const files = list ? Array.from(list).filter((f) => f.type.startsWith('image/')) : [];
        e.target.value = '';
        if (files.length === 0) return;
        setUploading(true);
        try {
            const fd = new FormData();
            for (const f of files) fd.append('files', f);
            fd.append('captions', JSON.stringify(files.map(() => '')));
            const res = await fetch(`/api/providers/${providerId}/gallery`, {
                method: 'POST',
                body: fd,
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                toast.error(j.error ?? 'Upload failed.');
                return;
            }
            toast.success(
                files.length === 1
                    ? 'Photo uploaded. It will appear once approved.'
                    : 'Photos uploaded. They will appear once approved.',
            );
            router.refresh();
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete() {
        if (!deleteId || deleting) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/pro/gallery?id=${encodeURIComponent(deleteId)}`, {
                method: 'DELETE',
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
            if (!res.ok || !j.ok) {
                toast.error(j.error ?? 'Could not delete photo.');
                return;
            }
            toast.success('Photo deleted.');
            setDeleteId(null);
            router.refresh();
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <div className="flex w-full flex-col gap-3">
                <h1 className="text-2xl font-semibold text-foreground">Manage Photos</h1>
                <p className="text-sm text-muted-foreground">
                    Photos you add appear on your public profile once approved.
                </p>
            </div>

            {canEdit ? (
                <div className="flex flex-col gap-2">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={handleFiles}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                    >
                        {uploading ? <Spinner className="size-4" /> : <Plus className="size-4" />}
                        {uploading ? 'Uploading…' : 'Add Photos'}
                    </Button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Only owners and admins can manage photos.
                </p>
            )}

            {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos yet.</p>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((img) => (
                        <div key={img.id} className="relative">
                            <AspectRatio
                                ratio={1}
                                className="overflow-hidden rounded-lg border border-border bg-muted"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={img.url}
                                    alt={img.caption ?? 'Profile photo'}
                                    className="size-full object-cover"
                                />
                            </AspectRatio>
                            {img.pending ? (
                                <Badge variant="secondary" className="absolute left-2 top-2">
                                    Pending Review
                                </Badge>
                            ) : null}
                            {canEdit ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="absolute right-2 top-2 size-8"
                                    aria-label="Delete photo"
                                    onClick={() => setDeleteId(img.id)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            <AlertDialog
                open={deleteId !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the photo from your profile. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDelete();
                            }}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
