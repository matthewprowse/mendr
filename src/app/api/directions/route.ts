import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

const DIRECTIONS_CACHE_DAYS = 7;

function directionsCacheKey(origin: string, destination: string): string {
    const o = origin.trim().toLowerCase();
    const d = destination.trim().toLowerCase();
    return o <= d ? `${o}|${d}` : `${d}|${o}`;
}

export async function GET(req: NextRequest) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Directions API not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');

    if (!origin || !destination) {
        return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
    }

    const queryKey = directionsCacheKey(origin, destination);
    try {
        const supabase = await createSupabaseServerClient();
        const cutoff = new Date(Date.now() - DIRECTIONS_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await supabase
            .from('directions_cache')
            .select('distance_text, distance_meters, duration_text, duration_seconds')
            .eq('query_key', queryKey)
            .gt('created_at', cutoff)
            .maybeSingle();
        if (cached) {
            return NextResponse.json({
                distance_text: cached.distance_text ?? null,
                distance_meters: cached.distance_meters ?? null,
                duration_text: cached.duration_text ?? null,
                duration_seconds: cached.duration_seconds ?? null,
            });
        }
    } catch {
        // no cache; fall through to Google
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
            origin
        )}&destination=${encodeURIComponent(destination)}&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return NextResponse.json(
                { error: data.error_message || 'Directions request failed' },
                { status: 400 }
            );
        }

        const route = data.routes?.[0];
        const leg = route?.legs?.[0];
        const distance_text = leg?.distance?.text ?? null;
        const distance_meters = leg?.distance?.value ?? null;
        const duration_text = leg?.duration?.text ?? null;
        const duration_seconds = leg?.duration?.value ?? null;

        try {
            const admin = await createSupabaseAdminClient();
            await admin.from('directions_cache').upsert(
                {
                    query_key: queryKey,
                    distance_text,
                    distance_meters,
                    duration_text,
                    duration_seconds,
                },
                { onConflict: 'query_key' }
            );
        } catch {
            // ignore cache write failure
        }

        return NextResponse.json({
            distance_text,
            distance_meters,
            duration_text,
            duration_seconds,
        });
    } catch (e: any) {
        console.error('Directions API error:', e);
        return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
    }
}
