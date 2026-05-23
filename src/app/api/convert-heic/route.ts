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
        // KNOWN BUG (2026-05-23): `heic-convert` decodes HEIC to raw RGB
        // pixels then re-encodes to JPEG WITHOUT consulting the HEIC
        // orientation metadata. iPhone HEIC files taken in portrait carry an
        // orientation tag (typically 6 = rotate 90° CW for display); after
        // this route the resulting JPEG is landscape and has no EXIF, so the
        // browser and Gemini both see a sideways image. To fix properly,
        // replace `heic-convert` with `sharp` (handles HEIC orientation
        // natively, well-tested on Vercel's nodejs runtime) or read the
        // orientation tag separately and rotate the output buffer here. See
        // docs/testing-build-followup.md and the diagnosis-accuracy doc for
        // the rollout plan. Filed as task — DO NOT half-fix inline.
        const output = await convert({
            buffer: input,
            format: 'JPEG',
            quality: 0.9,
        } as any);
        const outBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array);
        const base64 = outBuffer.toString('base64');
        return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${base64}` });
    } catch {
        return NextResponse.json({ error: 'Could not convert HEIC image.' }, { status: 500 });
    }
}
