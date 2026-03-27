import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Detect MIME type from magic bytes — trusting the content, not the header. */
function detectMimeFromBytes(bytes: Uint8Array): string | null {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return 'image/webp';
    return null;
}

function safeFileName(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'image';
    // Replace anything filesystem-unfriendly with `_` to avoid path traversal.
    return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'uploadImage');
    if (limited) return limited;

    const formData = await req.formData();
    const conversationId = String(formData.get('conversationId') || '').trim();

    const initialImageDescriptionRaw = formData.get('initial_image_description');
    const initial_image_description =
        typeof initialImageDescriptionRaw === 'string' ? initialImageDescriptionRaw.trim() : null;

    const file = formData.get('file') as any;
    const fileName = typeof file?.name === 'string' ? file.name : 'image';

    if (!conversationId || !UUID_RE.test(conversationId)) {
        return Response.json({ error: 'Missing or invalid conversationId' }, { status: 400 });
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
        return Response.json({ error: 'Missing file' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    // Public bucket so the diagnosis page can load the image by URL.
    const bucket = 'gallery';

    try {
        const arrayBuffer = await file.arrayBuffer();

        // Enforce 10 MB hard cap regardless of Content-Length header.
        if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
            return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
        }

        // Validate actual file content with magic bytes — ignore the declared Content-Type.
        const bytes = new Uint8Array(arrayBuffer);
        const detectedMime = detectMimeFromBytes(bytes);
        if (!detectedMime) {
            return Response.json({ error: 'Unsupported file type. Upload a JPEG, PNG, GIF, or WebP image.' }, { status: 415 });
        }
        const fileType = detectedMime;

        const ext = fileType.includes('png')
            ? 'png'
            : fileType.includes('webp')
              ? 'webp'
              : fileType.includes('gif')
                ? 'gif'
                : 'jpg';

        const originalBase = fileName.replace(/\.[^.]+$/, '');
        const baseName = safeFileName(originalBase);
        const time = Date.now();
        const objectPath = `welcome_scans/${conversationId}/${time}-${baseName}.${ext}`;
        const { error: uploadErr } = await admin.storage
            .from(bucket)
            .upload(objectPath, arrayBuffer, {
                contentType: fileType,
                upsert: true,
            });

        if (uploadErr) {
            return Response.json({ error: uploadErr.message }, { status: 500 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
            return Response.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
        }

        const imageUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;

        const { error: convErr } = await admin
            .from('conversations')
            .upsert({
                id: conversationId,
                title: 'New Diagnosis',
                image_url: imageUrl,
                initial_image_description: initial_image_description || null,
            })
            .select('id')
            .single();

        if (convErr) {
            return Response.json({ error: convErr.message }, { status: 500 });
        }

        return Response.json({ imageUrl });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        return Response.json({ error: message }, { status: 500 });
    }
}

