'use client';

import { useRouter } from 'next/navigation';
import { useRef, useCallback } from 'react';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { Button } from '@/components/ui/button';

type StartDiagnosisButtonProps = {
    children: React.ReactNode;
    className?: string;
    size?: 'default' | 'sm' | 'lg' | 'icon';
};

export function StartDiagnosisButton({ children, className, size }: StartDiagnosisButtonProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;

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
            } catch (err) {
                console.error('Upload failed:', err);
            }
        },
        [router]
    );

    const handleClick = () => inputRef.current?.click();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = '';
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleChange}
                className="hidden"
            />
            <Button type="button" onClick={handleClick} className={className} size={size}>
                {children}
            </Button>
        </>
    );
}
