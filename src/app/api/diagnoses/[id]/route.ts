import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PATCH_KEYS = new Set([
    'title',
    'image_url',
    'diagnosis',
    'urgency_key',
    'initial_image_description',
    'customer_address',
    'device',
    'user_agent',
    'user_id',
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
    const limited = checkRateLimit(_req, 'conversationRead');
    if (limited) return limited;

    const { id } = await context.params;
    const conversationId = String(id || '').trim();
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
    }

    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin
            .from('diagnoses')
            .select(
                'id,image_url,diagnosis,initial_image_description,customer_lat,customer_lng,customer_address'
            )
            .eq('id', conversationId)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ data: data ?? null });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        if (message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
            return NextResponse.json(
                { error: 'Server configuration error: missing service role key' },
                { status: 500 }
            );
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
    const limited = checkRateLimit(req, 'conversationUpsert');
    if (limited) return limited;

    const { id } = await context.params;
    const conversationId = String(id || '').trim();
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of PATCH_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const v = body[key];
        if (key === 'user_id') {
            patch[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
            continue;
        }
        if (key === 'diagnosis' || key === 'image_url' || key === 'title' || key === 'urgency_key') {
            patch[key] = v ?? null;
            continue;
        }
        if (
            key === 'initial_image_description' ||
            key === 'customer_address' ||
            key === 'device' ||
            key === 'user_agent'
        ) {
            patch[key] = typeof v === 'string' ? v : v == null ? null : String(v);
        }
    }

    const dataFieldCount = Object.keys(patch).filter((k) => k !== 'updated_at').length;
    if (dataFieldCount === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    try {
        const admin = await createSupabaseAdminClient();

        const { data: updated, error: updateErr } = await admin
            .from('diagnoses')
            .update(patch)
            .eq('id', conversationId)
            .select('id');

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        if (Array.isArray(updated) && updated.length > 0) {
            return NextResponse.json({ ok: true });
        }

        const title =
            typeof patch.title === 'string' && patch.title.trim()
                ? patch.title.trim()
                : 'New Diagnosis';

        const insertRow: Record<string, unknown> = {
            id: conversationId,
            title,
            image_url: patch.image_url ?? null,
            diagnosis: patch.diagnosis ?? null,
            urgency_key: patch.urgency_key ?? null,
            initial_image_description: patch.initial_image_description ?? null,
            customer_address: patch.customer_address ?? null,
            device: patch.device ?? null,
            user_agent: patch.user_agent ?? null,
            user_id: patch.user_id ?? null,
            updated_at: patch.updated_at,
        };

        const { error: insertErr } = await admin.from('diagnoses').insert(insertRow);
        if (insertErr) {
            // Concurrent PATCH (e.g. React Strict Mode / double submit): another request may have
            // inserted this id between our UPDATE (0 rows) and INSERT — retry UPDATE only.
            const msg = insertErr.message || '';
            const isDupPk =
                insertErr.code === '23505' ||
                msg.includes('duplicate key') ||
                msg.includes('diagnoses_pkey');
            if (isDupPk) {
                const { data: retryUpdated, error: retryErr } = await admin
                    .from('diagnoses')
                    .update(patch)
                    .eq('id', conversationId)
                    .select('id');
                if (retryErr) {
                    return NextResponse.json({ error: retryErr.message }, { status: 500 });
                }
                if (Array.isArray(retryUpdated) && retryUpdated.length > 0) {
                    return NextResponse.json({ ok: true });
                }
            }
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        if (message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
            return NextResponse.json(
                { error: 'Server configuration error: missing service role key' },
                { status: 500 }
            );
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
