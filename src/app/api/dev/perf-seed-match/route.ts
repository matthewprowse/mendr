import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

type SeedBody = {
    trade?: unknown;
    tradeDetail?: unknown;
    lat?: unknown;
    lng?: unknown;
    address?: unknown;
};

export async function POST(req: NextRequest) {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const limited = await checkRateLimit(req, 'conversationUpsert');
    if (limited) return limited;

    let body: SeedBody = {};
    try {
        body = (await req.json()) as SeedBody;
    } catch {
        // allow empty body
    }

    const trade = typeof body.trade === 'string' ? body.trade.trim() : 'Plumbing';
    const tradeDetail =
        typeof body.tradeDetail === 'string' ? body.tradeDetail.trim() : trade;
    const lat = typeof body.lat === 'number' ? body.lat : -33.9249; // Cape Town default
    const lng = typeof body.lng === 'number' ? body.lng : 18.4241;
    const address =
        typeof body.address === 'string' && body.address.trim()
            ? body.address.trim()
            : 'Cape Town, South Africa';

    if (!trade || trade.toLowerCase() === 'n/a') {
        return NextResponse.json({ error: 'Invalid trade' }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const diagnosis = {
        diagnosis: 'Perf seed diagnosis',
        trade,
        trade_detail: tradeDetail || trade,
        urgency_key: 'soon',
        requires_clarification: false,
        action_required: 'Inspect and repair',
    };

    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('diagnoses').insert({
            id,
            title: 'Perf Seed',
            diagnosis,
            urgency_key: 'soon',
            image_url: null,
            initial_image_description: 'perf seed',
            customer_lat: lat,
            customer_lng: lng,
            customer_address: address,
            updated_at: nowIso,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            conversationId: id,
            matchPath: `/match/${encodeURIComponent(id)}`,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

