// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'providerApplicationUpload');
    if (limited) return limited;

    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
    const files = formData.getAll('files');
    if (files.length === 0) return NextResponse.json({ error: 'No images provided.' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const images: Array<{ path: string; bucket: string; caption: null }> = [];

    for (const maybeFile of files) {
        const file = maybeFile as File;
        const mime = typeof file?.type === 'string' ? file.type : '';
        const name = typeof file?.name === 'string' ? file.name : '';
        if (!mime.startsWith('image/') && !/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)) continue;
        if (typeof file.size === 'number' && file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: `File too large: ${name || 'image'}. Max is 10MB.` }, { status: 422 });
        }
        const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `applications/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const bytes = await file.arrayBuffer();
        const { error } = await admin.storage.from('gallery').upload(path, bytes, {
            contentType: mime || 'image/jpeg',
            upsert: false,
        });
        if (!error) {
            images.push({ path, bucket: 'gallery', caption: null });
        } else {
            return NextResponse.json({ error: `Upload failed for ${name || 'image'}: ${error.message}` }, { status: 422 });
        }
    }

    if (images.length === 0) {
        return NextResponse.json({ error: 'Could not upload images.' }, { status: 422 });
    }
    return NextResponse.json({ images });
}
