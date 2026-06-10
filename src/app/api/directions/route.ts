/* eslint-disable no-console */
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GOOGLE_MAPS_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { googleSpendExceeded, spendBreakerResponse } from '@/lib/cost/spend-guard';

const DIRECTIONS_CACHE_DAYS = 7;

/**
 * Round a "lat,lng" coordinate string to 3 decimal places (~111 m precision).
 * Non-coordinate strings (address text) are returned lowercased unchanged.
 * This dramatically increases cache hit rate for users at the same address
 * across sessions where GPS precision varies slightly. (R7)
 */
function roundCoordString(s: string): string {
    const parts = s.trim().split(',');
    if (parts.length !== 2) return s.trim().toLowerCase();
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return s.trim().toLowerCase();
    return `${Math.round(lat * 1000) / 1000},${Math.round(lng * 1000) / 1000}`;
}

function directionsCacheKey(origin: string, destination: string): string {
    const o = roundCoordString(origin);
    const d = roundCoordString(destination);
    return o <= d ? `${o}|${d}` : `${d}|${o}`;
}

export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'directions');
    if (limited) return limited;

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
        const admin = await createSupabaseAdminClient();
        const cutoff = new Date(Date.now() - DIRECTIONS_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin
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

    // Cache missed — about to spend on Google. Trip the global daily breaker
    // if the cap is reached (finding M2).
    if (await googleSpendExceeded('directions')) {
        return spendBreakerResponse();
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
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal error';
        console.error(JSON.stringify({ type: 'directions_error', error: message }));
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
