'use client';

import { useState, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ProGalleryUpload({ providerId }: { providerId: string }) {
    const router = useRouter();
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const file = inputRef.current?.files?.[0];
        if (!file) {
            toast.error('Please choose an image.');
            return;
        }
        setLoading(true);
        try {
            const form = new FormData();
            form.set('file', file);
            if (description.trim()) form.set('description', description.trim());
            const res = await fetch(`/api/providers/${providerId}/gallery`, {
                method: 'POST',
                body: form,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            toast.success('Photo added to the gallery.');
            setDescription('');
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Upload failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
                <Label htmlFor="gallery_file">Add a photo</Label>
                <Input
                    id="gallery_file"
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="text-sm"
                />
            </div>
            <div className="flex-1 space-y-1">
                <Label htmlFor="gallery_desc">Description (optional)</Label>
                <Input
                    id="gallery_desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Completed bathroom repair"
                    className="text-sm"
                />
            </div>
            <Button type="submit" disabled={loading} size="sm">
                {loading ? 'Uploading…' : 'Upload'}
            </Button>
        </form>
    );
}
