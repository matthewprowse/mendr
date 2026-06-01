// Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (optional — falls back to in-memory)

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';

import convert from 'heic-convert';

export const runtime = 'nodejs';
export const maxDuration = 30;

function looksLikeHeic(name: string, type: string): boolean {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    return t.includes('heic') || t.includes('heif') || /\.(heic|heif)$/i.test(n);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'heicConvert');
    if (limited) return limited;

    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
        }
        if (!looksLikeHeic(file.name || '', file.type || '')) {
            return NextResponse.json({ error: 'File is not HEIC/HEIF.' }, { status: 400 });
        }

        const input = Buffer.from(await file.arrayBuffer());

        // `heic-convert` decodes via libheif, which already applies the HEIF
        // rotation transform (`irot`) — so the decoded JPEG pixels are upright.
        // We must NOT re-apply the EXIF Orientation tag here: iPhone HEICs carry
        // both the irot transform AND a stale Orientation tag (typically
        // 6 = "rotate 90° CW"), and rotating again left every portrait photo
        // 90° over-rotated. The output JPEG carries no EXIF, so downstream
        // client compression won't rotate it either.
        const decoded = await convert({
            buffer: input,
            format: 'JPEG',
            quality: 0.9,
        } as any);
        const outBuffer = Buffer.isBuffer(decoded) ? decoded : Buffer.from(decoded as Uint8Array);

        const base64 = outBuffer.toString('base64');
        return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${base64}` });
    } catch (err) {
        // Log the real reason so dev can diagnose. Production still surfaces
        // the generic message to the client.
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error('[convert-heic] failed:', msg);
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        return NextResponse.json(
            {
                error: 'Could not convert HEIC image.',
                ...(process.env.NODE_ENV !== 'production' ? { detail: msg } : {}),
            },
            { status: 500 }
        );
    }
}
