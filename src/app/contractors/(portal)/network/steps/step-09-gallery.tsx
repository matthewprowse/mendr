'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClientId } from '@/lib/client-random-id';
import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import type { UploadedImage } from './types';

export function StepGallery() {
    const { uploads, setUploads } = useWizard();
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);

    const openPicker = () => inputRef.current?.click();

    const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (e.target) e.target.value = '';
        if (!list?.length) return;
        setUploading(true);
        try {
            const fd = new FormData();
            let count = 0;
            for (const file of Array.from(list)) {
                fd.append('files', file);
                count += 1;
            }
            if (count === 0) return;
            const res = await fetch('/api/providers/application-images', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as {
                images?: Array<{ path: string; bucket: string }>;
                error?: string;
            } | null;
            if (!res.ok || !json?.images?.length) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const fresh: UploadedImage[] = json.images.map((item) => ({
                id: createClientId(),
                path: item.path,
                bucket: item.bucket,
                caption: null,
                previewUrl: `${base}/storage/v1/object/public/${item.bucket}/${item.path}`,
            }));
            setUploads([...uploads, ...fresh]);
        } finally {
            setUploading(false);
        }
    };

    const removeUpload = (id: string) => setUploads(uploads.filter((u) => u.id !== id));

    const swap = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        const s = uploads.findIndex((u) => u.id === sourceId);
        const t = uploads.findIndex((u) => u.id === targetId);
        if (s < 0 || t < 0) return;
        const copy = [...uploads];
        [copy[s], copy[t]] = [copy[t], copy[s]];
        setUploads(copy);
    };

    // Odd photo counts leave one open grid cell, so Add Photos fills it as a
    // tile. Even counts (and zero) get a full-width secondary button below.
    const isOdd = uploads.length % 2 === 1;

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Work Photos"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e)}
            />

            <div className="flex flex-col gap-4">
                {uploads.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                        {uploads.map((item, i) => {
                            const dragged = draggedId === item.id;
                            const dropTarget = dropTargetId === item.id;
                            return (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                        setDraggedId(item.id);
                                        try {
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', item.id);
                                        } catch {
                                            /* ignore */
                                        }
                                    }}
                                    onDragOver={(e) => {
                                        if (!draggedId || draggedId === item.id) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (dropTargetId !== item.id) setDropTargetId(item.id);
                                    }}
                                    onDragLeave={() => {
                                        if (dropTargetId === item.id) setDropTargetId(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const src = draggedId ?? e.dataTransfer.getData('text/plain');
                                        if (src && src !== item.id) swap(src, item.id);
                                        setDraggedId(null);
                                        setDropTargetId(null);
                                    }}
                                    onDragEnd={() => {
                                        setDraggedId(null);
                                        setDropTargetId(null);
                                    }}
                                    className={`relative aspect-square cursor-grab overflow-hidden rounded-lg border border-border bg-background transition-all duration-150 active:cursor-grabbing ${
                                        dragged ? 'opacity-50' : ''
                                    } ${dropTarget ? 'ring-2 ring-foreground' : ''}`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.previewUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        draggable={false}
                                    />
                                    <Badge variant="count" className="absolute bottom-2 left-2">
                                        {i + 1}
                                    </Badge>
                                    <Badge asChild variant="outline">
                                        <button
                                            type="button"
                                            className="absolute right-2 top-2 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeUpload(item.id);
                                            }}
                                            aria-label="Remove photo"
                                        >
                                            Remove
                                        </button>
                                    </Badge>
                                </div>
                            );
                        })}
                        {isOdd ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="aspect-square h-auto w-full"
                                disabled={uploading}
                                onClick={openPicker}
                            >
                                {uploading ? 'Uploading…' : 'Add Photos'}
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                {!isOdd ? (
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full"
                        disabled={uploading}
                        onClick={openPicker}
                    >
                        {uploading ? 'Uploading…' : 'Add Photos'}
                    </Button>
                ) : null}

                <p className="text-center text-xs text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
            </div>
        </div>
    );
}
