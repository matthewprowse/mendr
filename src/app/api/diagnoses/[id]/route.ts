// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PATCH_KEYS = new Set([
    'title',
    'image_url',
    'image_urls',
    'diagnosis',
    'initial_image_description',
    'customer_address',
    'device',
    'user_agent',
    'user_id',
]);

const MAX_PERSISTED_IMAGE_URLS = 4;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
    const limited = await checkRateLimit(_req, 'conversationRead');
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
                'id,image_url,image_urls,diagnosis,initial_image_description,customer_lat,customer_lng,customer_address'
            )
            .eq('id', conversationId)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Normalise to a canonical `imageUrls: string[]` field. Prefer the
        // JSONB array; fall back to the legacy single-string `image_url` for
        // rows created before the multi-image migration.
        const enriched = data
            ? (() => {
                  const raw = (data as Record<string, unknown>).image_urls;
                  let imageUrls: string[] = [];
                  if (Array.isArray(raw)) {
                      imageUrls = (raw as unknown[])
                          .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                          .map((u) => u.trim());
                  }
                  if (imageUrls.length === 0) {
                      const legacy = (data as Record<string, unknown>).image_url;
                      if (typeof legacy === 'string' && legacy.trim()) {
                          imageUrls = [legacy.trim()];
                      }
                  }
                  return {
                      ...data,
                      imageUrls,
                      imageUrl: imageUrls[0] ?? null,
                  };
              })()
            : null;

        return NextResponse.json({ data: enriched });
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
    const limited = await checkRateLimit(req, 'conversationUpsert');
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
        if (key === 'image_urls') {
            // Normalise to a clean string[]; cap at MAX_PERSISTED_IMAGE_URLS.
            if (Array.isArray(v)) {
                const cleaned = (v as unknown[])
                    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                    .map((u) => u.trim())
                    .slice(0, MAX_PERSISTED_IMAGE_URLS);
                patch.image_urls = cleaned;
                // Always keep legacy `image_url` aligned with the first entry for
                // backward-compat with readers that haven't migrated.
                if (cleaned.length > 0 && !Object.prototype.hasOwnProperty.call(body, 'image_url')) {
                    patch.image_url = cleaned[0];
                }
            } else if (v == null) {
                patch.image_urls = null;
            }
            continue;
        }
        if (key === 'diagnosis' || key === 'image_url' || key === 'title') {
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
            image_urls: patch.image_urls ?? null,
            diagnosis: patch.diagnosis ?? null,
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
