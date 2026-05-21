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
