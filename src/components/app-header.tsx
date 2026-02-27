'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { supabase } from '@/lib/supabase';
import { UserAvatarMenu } from '@/components/user-avatar-menu';

interface AppHeaderProps {
    imageSrc?: string | null;
    showViewImage?: boolean;
}

type Service = {
    id: string;
    label: string;
};

export function AppHeader({ imageSrc, showViewImage = true }: AppHeaderProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [loadingServices, setLoadingServices] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fetchServices = useCallback(async () => {
        if (services.length > 0) return;
        setLoadingServices(true);
        try {
            const { data } = await supabase
                .from('services')
                .select('id, label')
                .eq('active', true)
                .order('sort_order', { ascending: true });
            if (data) setServices(data);
        } catch {
            // ignore
        } finally {
            setLoadingServices(false);
        }
    }, [services.length]);

    useEffect(() => {
        if (open) fetchServices();
    }, [open, fetchServices]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) return;

        setUploading(true);
        setOpen(false);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
            const conversationId = crypto.randomUUID();
            setImageData(conversationId, finalDataUrl, file.name);
            router.push(`/chat/${conversationId}`);
        } catch {
            // ignore
        } finally {
            setUploading(false);
        }
    };

    const handleServiceSelect = (label: string) => {
        setOpen(false);
        const conversationId = crypto.randomUUID();
        const params = new URLSearchParams({ trade: label });
        router.push(`/chat/${conversationId}?${params.toString()}`);
    };

    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2">
                    <NextImage
                        src="/logo.svg"
                        alt="Scandio"
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-lg"
                    />
                    <span className="font-semibold">Scandio</span>
                </Link>

                <div className="flex items-center gap-2">
                    {imageSrc && showViewImage && (
                        <Button variant="secondary" onClick={() => window.open(imageSrc, '_blank')}>
                            View Image
                        </Button>
                    )}

                    {/* New Diagnosis */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="secondary" disabled={uploading}>
                                {uploading ? 'Uploading…' : 'New Diagnosis'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="w-64 p-2 overflow-hidden"
                            sideOffset={8}
                        >
                            <div className="px-2 pb-1 pt-1">
                                <p className="text-sm font-semibold text-foreground">
                                    New Diagnosis
                                </p>
                            </div>

                            {/* Upload image — ghost button, h-9 */}
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-start h-9"
                                onClick={() => { setOpen(false); fileInputRef.current?.click(); }}
                            >
                                Upload Image
                            </Button>

                            {/* Service list */}
                            <div className="max-h-64 overflow-y-auto">
                                {loadingServices ? (
                                    <div className="flex items-center justify-center py-4">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                    </div>
                                ) : services.length > 0 && (
                                    <>
                                        <div className="my-1 h-px bg-border" />
                                        {services.map((svc) => (
                                            <Button
                                                key={svc.id}
                                                type="button"
                                                variant="ghost"
                                                className="w-full justify-start h-9"
                                                onClick={() => handleServiceSelect(svc.label)}
                                            >
                                                {svc.label}
                                            </Button>
                                        ))}
                                    </>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>

                    <UserAvatarMenu />
                </div>
            </div>
        </header>
    );
}
