import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientId } from '@/lib/client-random-id';
import { supabase } from '@/lib/supabase';
import type { GalleryDraftItem, GalleryImage } from '../types/types';

type ProviderImageRow = {
    id?: unknown;
    path?: unknown;
    bucket?: unknown;
    caption?: unknown;
    source?: unknown;
};

const toProviderImageRows = (rows: unknown): ProviderImageRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is ProviderImageRow => !!row && typeof row === 'object');
};

export function useProGallery(params: {
    resolvedProviderId: string | null;
    providerGooglePlaceId: string | null;
}) {
    const { resolvedProviderId, providerGooglePlaceId } = params;
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const [isGalleryLoading, setIsGalleryLoading] = useState(false);
    const [isSyncingGoogleGallery, setIsSyncingGoogleGallery] = useState(false);
    const [galleryUploading, setGalleryUploading] = useState(false);
    const [galleryAddOpen, setGalleryAddOpen] = useState(false);
    const [galleryDraftItems, setGalleryDraftItems] = useState<GalleryDraftItem[]>([]);
    const [galleryModalError, setGalleryModalError] = useState<string | null>(null);
    const [galleryModalSuccess, setGalleryModalSuccess] = useState(false);
    const [lightbox, setLightbox] = useState<{ url: string; caption: string | null } | null>(null);
    const galleryModalInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;

        const mapRows = (rows: ProviderImageRow[], supabaseUrl: string) =>
            rows.map((r) => ({
                id: String(r.id),
                url: `${supabaseUrl}/storage/v1/object/public/${r.bucket || 'gallery'}/${r.path}`,
                caption: typeof r.caption === 'string' ? r.caption : null,
                source: r.source != null && String(r.source).trim() !== '' ? String(r.source) : null,
                path: typeof r.path === 'string' ? r.path : null,
            }));

        async function loadGallery() {
            if (!resolvedProviderId) {
                setGalleryImages([]);
                setIsGalleryLoading(false);
                return;
            }
            setIsGalleryLoading(true);
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            try {
                const { data: rows, error } = await supabase
                    .from('provider_images')
                    .select('id, path, bucket, caption, source')
                    .eq('provider_id', resolvedProviderId)
                    .eq('status', 'approved')
                    .order('sort_order', { ascending: true })
                    .order('id', { ascending: true });
                if (cancelled) return;
                if (error) {
                    setGalleryImages([]);
                    return;
                }
                let list = toProviderImageRows(rows);
                if (list.length === 0 && providerGooglePlaceId) {
                    setIsSyncingGoogleGallery(true);
                    try {
                        const res = await fetch(`/api/providers/${resolvedProviderId}/sync-google-gallery`, {
                            method: 'POST',
                        });
                        if (res.ok) {
                            const { data: again } = await supabase
                                .from('provider_images')
                                .select('id, path, bucket, caption, source')
                                .eq('provider_id', resolvedProviderId)
                                .eq('status', 'approved')
                                .order('sort_order', { ascending: true })
                                .order('id', { ascending: true });
                            list = toProviderImageRows(again);
                        }
                    } finally {
                        if (!cancelled) setIsSyncingGoogleGallery(false);
                    }
                }
                if (!cancelled) setGalleryImages(mapRows(list, supabaseUrl));
            } finally {
                if (!cancelled) setIsGalleryLoading(false);
            }
        }

        void loadGallery();
        return () => {
            cancelled = true;
        };
    }, [providerGooglePlaceId, resolvedProviderId]);

    const openGalleryAddDialog = useCallback(() => {
        setGalleryDraftItems((prev) => {
            prev.forEach((p) => URL.revokeObjectURL(p.preview));
            return [];
        });
        setGalleryModalError(null);
        setGalleryModalSuccess(false);
        setGalleryAddOpen(true);
    }, []);

    const removeGalleryDraftItem = useCallback((id: string) => {
        setGalleryDraftItems((prev) => {
            const item = prev.find((p) => p.id === id);
            if (item) URL.revokeObjectURL(item.preview);
            return prev.filter((p) => p.id !== id);
        });
    }, []);

    const updateGalleryDraftCaption = useCallback((id: string, caption: string) => {
        setGalleryDraftItems((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
    }, []);

    const handleGalleryModalFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list?.length) return;
        setGalleryModalSuccess(false);
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
    }, []);

    const handleGalleryModalSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!resolvedProviderId || galleryDraftItems.length === 0) return;
            setGalleryUploading(true);
            setGalleryModalError(null);
            setGalleryModalSuccess(false);
            try {
                const fd = new FormData();
                for (const item of galleryDraftItems) {
                    fd.append('files', item.file);
                }
                fd.append('captions', JSON.stringify(galleryDraftItems.map((i) => i.caption)));
                const res = await fetch(`/api/providers/${resolvedProviderId}/gallery`, {
                    method: 'POST',
                    body: fd,
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setGalleryModalError((j as { error?: string })?.error || 'Upload failed');
                    return;
                }
                setGalleryModalSuccess(true);
                setGalleryDraftItems((prev) => {
                    prev.forEach((p) => URL.revokeObjectURL(p.preview));
                    return [];
                });
            } finally {
                setGalleryUploading(false);
            }
        },
        [galleryDraftItems, resolvedProviderId]
    );

    const bannerImage = galleryImages.length > 0 ? galleryImages[0] : null;
    const galleryGridImages = useMemo(() => galleryImages.slice(1), [galleryImages]);

    return {
        galleryImages,
        isGalleryLoading,
        isSyncingGoogleGallery,
        galleryUploading,
        galleryAddOpen,
        setGalleryAddOpen,
        galleryDraftItems,
        galleryModalError,
        galleryModalSuccess,
        lightbox,
        setLightbox,
        galleryModalInputRef,
        openGalleryAddDialog,
        removeGalleryDraftItem,
        updateGalleryDraftCaption,
        handleGalleryModalFiles,
        handleGalleryModalSubmit,
        bannerImage,
        galleryGridImages,
        setGalleryDraftItems,
        setGalleryModalError,
        setGalleryModalSuccess,
    };
}
