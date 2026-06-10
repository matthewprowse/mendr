// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
//
// Admin-only AI pricing management.
//
// GET  /api/admin/ai-pricing
//   Returns the currently active rows of ai_model_pricing (one per model, where
//   effective_until IS NULL), ordered by model_name.
//
// POST /api/admin/ai-pricing
//   Body: {
//     model_name: string,
//     input_per_1m_usd: number,
//     output_per_1m_usd: number,
//     cached_input_per_1m_usd?: number | null,
//     notes?: string,
//     source?: 'manual' | 'google-pricing-page' | 'reconciliation',
//   }
//   Closes out the existing active row (sets effective_until = now()) and
//   inserts a new active row. This preserves full price history so monthly
//   reconciliation can audit mid-month price changes.
//
// After a successful POST we invalidate the in-memory pricing cache so the
// next cost-log call picks up the new rate immediately rather than waiting
// for the 5-minute TTL.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { invalidatePricingCache } from '@/lib/ai/ai-cost-logger';

interface PricingPostBody {
    model_name?: unknown;
    input_per_1m_usd?: unknown;
    output_per_1m_usd?: unknown;
    cached_input_per_1m_usd?: unknown;
    notes?: unknown;
    source?: unknown;
}

const ALLOWED_SOURCES = new Set(['manual', 'google-pricing-page', 'reconciliation']);

/**
 * Single-line JSON log for the admin pricing route. Stays in the existing
 * structured-log convention without polluting the AiEndpoint enum.
 */
function logRouteEvent(payload: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
        type: 'admin_ai_pricing',
        ts: new Date().toISOString(),
        ...payload,
    }));
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const startedAt = Date.now();
    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin
            .from('ai_model_pricing')
            .select('id, model_name, input_per_1m_usd, output_per_1m_usd, cached_input_per_1m_usd, effective_from, source, notes')
            .is('effective_until', null)
            .order('model_name', { ascending: true });

        if (error) {
            logRouteEvent({ method: 'GET', status: 'error', durationMs: Date.now() - startedAt, error: error.message });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        logRouteEvent({ method: 'GET', status: 'ok', durationMs: Date.now() - startedAt, rows: (data ?? []).length });
        return NextResponse.json({ rows: data ?? [] });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logRouteEvent({ method: 'GET', status: 'error', durationMs: Date.now() - startedAt, error: message });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const startedAt = Date.now();
    let body: PricingPostBody;
    try {
        body = await req.json() as PricingPostBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // ── Validate input ──────────────────────────────────────────────────────
    const modelName = typeof body.model_name === 'string' ? body.model_name.trim() : '';
    const inputRate = Number(body.input_per_1m_usd);
    const outputRate = Number(body.output_per_1m_usd);
    const cachedRate =
        body.cached_input_per_1m_usd === undefined || body.cached_input_per_1m_usd === null
            ? null
            : Number(body.cached_input_per_1m_usd);
    const notes = typeof body.notes === 'string' ? body.notes : null;
    const source =
        typeof body.source === 'string' && ALLOWED_SOURCES.has(body.source)
            ? body.source
            : 'manual';

    if (!modelName) {
        return NextResponse.json({ error: 'model_name is required' }, { status: 400 });
    }
    if (!Number.isFinite(inputRate) || inputRate < 0) {
        return NextResponse.json({ error: 'input_per_1m_usd must be a non-negative number' }, { status: 400 });
    }
    if (!Number.isFinite(outputRate) || outputRate < 0) {
        return NextResponse.json({ error: 'output_per_1m_usd must be a non-negative number' }, { status: 400 });
    }
    if (cachedRate !== null && (!Number.isFinite(cachedRate) || cachedRate < 0)) {
        return NextResponse.json({ error: 'cached_input_per_1m_usd must be a non-negative number or null' }, { status: 400 });
    }

    try {
        const admin = await createSupabaseAdminClient();

        // Close out the currently-active row(s) for this model. There should
        // only ever be one; the partial index does not enforce that, but the
        // close-out applies uniformly either way.
        const nowIso = new Date().toISOString();
        const { error: closeError } = await admin
            .from('ai_model_pricing')
            .update({ effective_until: nowIso })
            .eq('model_name', modelName)
            .is('effective_until', null);

        if (closeError) {
            logRouteEvent({ method: 'POST', stage: 'close', status: 'error', durationMs: Date.now() - startedAt, modelName, error: closeError.message });
            return NextResponse.json({ error: closeError.message }, { status: 500 });
        }

        // Insert the new active row.
        const { data, error: insertError } = await admin
            .from('ai_model_pricing')
            .insert({
                model_name: modelName,
                input_per_1m_usd: inputRate,
                output_per_1m_usd: outputRate,
                cached_input_per_1m_usd: cachedRate,
                source,
                notes,
            })
            .select('id, model_name, input_per_1m_usd, output_per_1m_usd, cached_input_per_1m_usd, effective_from, source, notes')
            .single();

        if (insertError) {
            logRouteEvent({ method: 'POST', stage: 'insert', status: 'error', durationMs: Date.now() - startedAt, modelName, error: insertError.message });
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // Drop the in-memory pricing cache so the new rate is observed on the
        // next cost-log call rather than waiting for the 5-minute TTL.
        invalidatePricingCache();

        logRouteEvent({ method: 'POST', status: 'ok', durationMs: Date.now() - startedAt, modelName, source });
        return NextResponse.json({ row: data });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logRouteEvent({ method: 'POST', status: 'error', durationMs: Date.now() - startedAt, modelName, error: message });
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
