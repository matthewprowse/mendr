import { NextRequest, NextResponse } from 'next/server';

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
        if (!leg) {
            return NextResponse.json({
                distance_text: null,
                distance_meters: null,
                duration_text: null,
                duration_seconds: null,
            });
        }

        return NextResponse.json({
            distance_text: leg.distance?.text ?? null,
            distance_meters: leg.distance?.value ?? null,
            duration_text: leg.duration?.text ?? null,
            duration_seconds: leg.duration?.value ?? null,
        });
    } catch (e: any) {
        console.error('Directions API error:', e);
        return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
    }
}
