import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'conversationLocation');
    if (limited) return limited;

    try {
        const body = (await req.json()) as {
            id?: string;
            customer_lat?: unknown;
            customer_lng?: unknown;
            customer_address?: unknown;
        };
        const id = String(body?.id || '').trim();
        const lat = body?.customer_lat;
        const lng = body?.customer_lng;
        const customer_address =
            typeof body?.customer_address === 'string' ? body.customer_address.trim() : null;

        if (!id || !UUID_RE.test(id)) {
            return NextResponse.json({ error: 'Missing or invalid conversation id' }, { status: 400 });
        }
        if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
        }

        const admin = await createSupabaseAdminClient();
        const { error } = await admin
            .from('diagnoses')
            .update({
                customer_lat: lat,
                customer_lng: lng,
                customer_address: customer_address || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid request';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
