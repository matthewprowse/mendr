/**
 * Shared photo-upload pipeline for the homeowner side.
 *
 * Used by `/start` (initial diagnosis) and the `/diagnosis` refine overlay
 * (attach more photos when re-scanning). Centralising the logic here keeps
 * the HEIC conversion + compression + storage upload behaviour identical
 * across both screens — and means we only have one place to tune when image
 * formats or storage paths change.
 */
import { compressImage } from '@/lib/image-compression';

export type SelectedPhotoStatus = 'pending' | 'ready' | 'error';

export type SelectedPhoto = {
    id: string;
    file: File;
    status: SelectedPhotoStatus;
    /** Compressed data: URL used for in-page rendering. */
    previewSrc: string | null;
    /** Same as previewSrc by default — kept distinct in case we ever
     *  want to send a higher-res blob to Gemini than we display. */
    diagnosisSrc: string | null;
    errorMessage?: string;
};

/** Random id for keying React lists + correlating uploaded URLs back to tiles. */
export function createSelectedPhotoId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Apple's iPhones still hand us HEIC by default — detect both by MIME and extension. */
export function isHeicLike(file: File): boolean {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/i.test(name);
}

export function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === 'string') {
                resolve(result);
                return;
            }
            reject(new Error('Could not read the selected image.'));
        };
        reader.onerror = () =>
            reject(reader.error ?? new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
    });
}

export function dataUrlToFile(dataUrl: string, fallbackName = 'upload.jpg'): File {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta?.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] || 'image/jpeg';
    const binStr = atob(base64 || '');
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binStr.charCodeAt(i);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const baseName = fallbackName.replace(/\.[^.]+$/, '') || 'upload';
    return new File([bytes], `${baseName}.${ext}`, { type: mime });
}

/**
 * Normalise a raw `File` from `<input type="file">` into the canonical
 * `SelectedPhoto` shape: convert HEIC, compress, and stash both a preview
 * and a diagnosis-quality data: URL. Throws on conversion failure so the
 * caller can surface an error state on the tile.
 */
export async function normalizeSelectedPhoto(file: File): Promise<SelectedPhoto> {
    let raw = await readFileAsDataUrl(file);
    if (isHeicLike(file)) {
        const form = new FormData();
        form.set('file', file);
        const res = await fetch('/api/convert-heic', { method: 'POST', body: form });
        const json = (await res.json().catch(() => ({}))) as { dataUrl?: string };
        if (
            !res.ok ||
            typeof json.dataUrl !== 'string' ||
            !json.dataUrl.startsWith('data:image/')
        ) {
            throw new Error('Could not convert HEIC image.');
        }
        raw = json.dataUrl;
    }
    const compressed = await compressImage(raw);
    const normalizedFile = dataUrlToFile(compressed, file.name);
    return {
        id: createSelectedPhotoId(),
        file: normalizedFile,
        status: 'ready',
        previewSrc: compressed,
        diagnosisSrc: compressed,
    };
}

/** Push the compressed file to Supabase storage via `/api/upload-image`. */
export async function uploadPhotoToStorage(
    file: File,
    conversationId: string
): Promise<string | null> {
    try {
        const form = new FormData();
        form.set('conversationId', conversationId);
        form.set('file', file);
        const res = await fetch('/api/upload-image', { method: 'POST', body: form });
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { imageUrl?: string } | null;
        return typeof json?.imageUrl === 'string' && json.imageUrl.startsWith('http')
            ? json.imageUrl
            : null;
    } catch {
        return null;
    }
}
