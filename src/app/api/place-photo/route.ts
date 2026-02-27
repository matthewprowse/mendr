import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies Google Place Photo media. Client passes photo resource name (e.g. places/ChIJ.../photos/xxx).
 * We call Places getMedia with skipHttpRedirect=true, then redirect to the returned photoUri.
 */
export async function GET(req: NextRequest) {
    const name = req.nextUrl.searchParams.get('name');
    const maxWidth = Math.min(800, Math.max(100, parseInt(req.nextUrl.searchParams.get('maxWidthPx') || '400', 10) || 400));

    if (!name || !name.startsWith('places/')) {
        return NextResponse.json({ error: 'Missing or invalid name' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }

    const url = `https://places.googleapis.com/v1/${name}/media?key=${encodeURIComponent(apiKey)}&maxWidthPx=${maxWidth}&skipHttpRedirect=true`;
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json({ error: 'Photo unavailable' }, { status: res.status === 404 ? 404 : 502 });
        }
        const data = (await res.json()) as { photoUri?: string };
        const photoUri = data?.photoUri;
        if (!photoUri || typeof photoUri !== 'string') {
            return NextResponse.json({ error: 'No photo URI' }, { status: 502 });
        }
        return NextResponse.redirect(photoUri, 302);
    } catch (e) {
        console.warn('place-photo fetch failed', (e as Error).message);
        return NextResponse.json({ error: 'Failed to load photo' }, { status: 502 });
    }
}
