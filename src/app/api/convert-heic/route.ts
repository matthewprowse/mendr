// Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (optional — falls back to in-memory)

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';

import convert from 'heic-convert';
import sharp from 'sharp';
import {
    readHeicOrientation,
    orientationToSharpRotate,
} from './heic-orientation';

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

        // EXIF orientation (2026-05-23 fix): `heic-convert` decodes raw HEIC
        // pixels and produces a JPEG with NO EXIF. iPhone HEICs are stored
        // with sensor-orientation pixels plus an Orientation tag (typically
        // 6 = "rotate 90° CW to display"). Without this fix, Gemini sees the
        // photo sideways. We read the orientation via libvips' HEIF parser
        // (sharp can read HEIC METADATA on every platform — it just can't
        // decode HEIC pixels without libheif), then apply the rotation to
        // the JPEG buffer via sharp after heic-convert produces it.
        const orientation = await readHeicOrientation(input);

        const decoded = await convert({
            buffer: input,
            format: 'JPEG',
            quality: 0.9,
        } as any);
        const decodedBuffer = Buffer.isBuffer(decoded) ? decoded : Buffer.from(decoded as Uint8Array);

        const { rotateDegrees, flipHorizontal, flipVertical } =
            orientationToSharpRotate(orientation);

        let outBuffer: Buffer;
        if (rotateDegrees === 0 && !flipHorizontal && !flipVertical) {
            outBuffer = decodedBuffer;
        } else {
            let pipeline = sharp(decodedBuffer);
            if (flipHorizontal) pipeline = pipeline.flop();
            if (flipVertical) pipeline = pipeline.flip();
            if (rotateDegrees !== 0) pipeline = pipeline.rotate(rotateDegrees);
            outBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
        }

        const base64 = outBuffer.toString('base64');
        return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${base64}` });
    } catch {
        return NextResponse.json({ error: 'Could not convert HEIC image.' }, { status: 500 });
    }
}
