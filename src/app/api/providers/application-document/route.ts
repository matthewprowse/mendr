// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const MAX_BYTES = 10 * 1024 * 1024;

const KIND_PREFIX: Record<string, string> = {
    certification: 'applications/cert',
    kyc_id: 'applications/kyc',
    kyc_selfie: 'applications/kyc',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'providerApplicationUpload');
    if (limited) return limited;

    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

    const kind = typeof formData.get('kind') === 'string' ? String(formData.get('kind')).trim() : '';
    if (!kind || !(kind in KIND_PREFIX)) {
        return NextResponse.json(
            { error: 'Invalid kind. Use certification, kyc_id, or kyc_selfie.' },
            { status: 400 }
        );
    }

    const file = formData.get('file');
    if (!file || typeof (file as File).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    const f = file as File;
    const mime = typeof f.type === 'string' ? f.type : '';
    const name = typeof f.name === 'string' ? f.name : '';

    const isCert = kind === 'certification';
    const isKycId = kind === 'kyc_id';
    const okMime =
        mime.startsWith('image/') ||
        ((isCert || isKycId) && mime === 'application/pdf') ||
        /\.(pdf|png|jpe?g|webp|gif|heic|heif)$/i.test(name);
    if (!okMime) {
        return NextResponse.json({ error: 'Upload a PDF or image file.' }, { status: 422 });
    }
    if (kind === 'kyc_selfie' && !mime.startsWith('image/') && !/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)) {
        return NextResponse.json({ error: 'Selfie must be an image.' }, { status: 422 });
    }
    if (typeof f.size === 'number' && f.size > MAX_BYTES) {
        return NextResponse.json({ error: 'File must be under 10MB.' }, { status: 422 });
    }

    const ext =
        name.split('.').pop()?.toLowerCase() ||
        (mime === 'application/pdf' ? 'pdf' : mime.includes('png') ? 'png' : 'jpg');
    const prefix = KIND_PREFIX[kind];
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const admin = await createSupabaseAdminClient();
    const bytes = await f.arrayBuffer();
    const { error } = await admin.storage.from('gallery').upload(path, bytes, {
        contentType: mime || 'application/octet-stream',
        upsert: false,
    });
    if (error) {
        return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 422 });
    }
    return NextResponse.json({ path, bucket: 'gallery', fileName: name || 'document' });
}
