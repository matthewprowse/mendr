// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { stampDiagnosisDelivered } from '@/lib/analytics/funnel';
import {
    resolveDiagnosisIdentity,
    ownsDiagnosis,
    mintAnonCookie,
    type DiagnosisIdentity,
} from '@/lib/diagnosis/ownership';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `user_id` is deliberately NOT client-settable (finding C5). Ownership is
// derived from the session / anon cookie and forced server-side on insert.
const PATCH_KEYS = new Set([
    'title',
    'image_url',
    'image_urls',
    'diagnosis',
    'initial_image_description',
    'customer_address',
    'device',
    'user_agent',
]);

const MAX_PERSISTED_IMAGE_URLS = 4;

type RouteContext = { params: Promise<{ id: string }> };

/** When an authenticated caller touches a still-anonymous row they own (via the
 *  matching cookie), claim it onto their account so it appears in their history.
 *  user_id always comes from the session, never the client body (finding C5). */
function claimPatch(
    existing: { user_id: string | null },
    identity: DiagnosisIdentity,
): Record<string, unknown> {
    if (!existing.user_id && identity.userId) {
        return { user_id: identity.userId };
    }
    return {};
}

/** Owner columns for a freshly inserted row. Authenticated callers own by
 *  user_id; anonymous callers own by their scandio_anon cookie, minting one
 *  when absent so they can read the row back. */
function newRowOwner(identity: DiagnosisIdentity): {
    user_id: string | null;
    anon_key: string | null;
    mintedAnonKey: string | null;
} {
    if (identity.userId) {
        return { user_id: identity.userId, anon_key: null, mintedAnonKey: null };
    }
    if (identity.anonKey) {
        return { user_id: null, anon_key: identity.anonKey, mintedAnonKey: null };
    }
    const minted = crypto.randomUUID();
    return { user_id: null, anon_key: minted, mintedAnonKey: minted };
}

export async function GET(_req: NextRequest, context: RouteContext) {
    const limited = await checkRateLimit(_req, 'conversationRead');
    if (limited) return limited;

    const { id } = await context.params;
    const conversationId = String(id || '').trim();
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
    }

    const identity = await resolveDiagnosisIdentity(_req);

    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin
            .from('diagnoses')
            .select(
                'id,image_url,image_urls,diagnosis,initial_image_description,customer_lat,customer_lng,customer_address,user_id,anon_key'
            )
            .eq('id', conversationId)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Genuinely missing row (e.g. the client polled before the first
        // persist): preserve the legacy "data: null" contract so callers can
        // fall back gracefully. A row that EXISTS but is owned by someone else
        // returns 404 — never its address, GPS or photos (finding C4).
        if (data && !ownsDiagnosis(data, identity)) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Strip the internal owner columns before returning to the client.
        if (data) {
            delete (data as Record<string, unknown>).user_id;
            delete (data as Record<string, unknown>).anon_key;
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

    // The "Diagnosis Delivered" funnel stage is stamped the first time a
    // non-null diagnosis object is written. First write wins (see funnel helper).
    const finalizingDiagnosis =
        Object.prototype.hasOwnProperty.call(body, 'diagnosis') &&
        body.diagnosis != null &&
        typeof body.diagnosis === 'object';
    // Set-Cookie collected when we mint a fresh anon cookie for a brand-new
    // anonymous row, so the same caller can read it back afterwards.
    const extraHeaders: Record<string, string> = {};
    const respondOk = async () => {
        if (finalizingDiagnosis) await stampDiagnosisDelivered(conversationId);
        return NextResponse.json({ ok: true }, { headers: extraHeaders });
    };

    const identity = await resolveDiagnosisIdentity(req);

    try {
        const admin = await createSupabaseAdminClient();

        // Resolve current ownership before mutating a row addressed by a
        // client-supplied id (finding C5). The service role bypasses RLS, so
        // this check is the only authorization gate.
        const { data: existing, error: ownErr } = await admin
            .from('diagnoses')
            .select('user_id, anon_key')
            .eq('id', conversationId)
            .maybeSingle();
        if (ownErr) {
            return NextResponse.json({ error: ownErr.message }, { status: 500 });
        }

        if (existing) {
            if (!ownsDiagnosis(existing, identity)) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }
            const { data: updated, error: updateErr } = await admin
                .from('diagnoses')
                .update({ ...patch, ...claimPatch(existing, identity) })
                .eq('id', conversationId)
                .select('id');
            if (updateErr) {
                return NextResponse.json({ error: updateErr.message }, { status: 500 });
            }
            if (Array.isArray(updated) && updated.length > 0) {
                return respondOk();
            }
            // Row was deleted between the SELECT and the UPDATE.
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // No row yet — insert, forcing the owner columns from the resolved
        // identity. The client can never set user_id / anon_key (finding C5).
        const owner = newRowOwner(identity);
        if (owner.mintedAnonKey) {
            extraHeaders['Set-Cookie'] = mintAnonCookie(owner.mintedAnonKey);
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
            user_id: owner.user_id,
            anon_key: owner.anon_key,
            updated_at: patch.updated_at,
        };

        const { error: insertErr } = await admin.from('diagnoses').insert(insertRow);
        if (insertErr) {
            // Concurrent PATCH (e.g. React Strict Mode / double submit): another
            // request inserted this id between our SELECT (no row) and INSERT.
            // Re-resolve ownership of the winning row before updating it.
            const msg = insertErr.message || '';
            const isDupPk =
                insertErr.code === '23505' ||
                msg.includes('duplicate key') ||
                msg.includes('diagnoses_pkey');
            if (isDupPk) {
                const { data: raceRow } = await admin
                    .from('diagnoses')
                    .select('user_id, anon_key')
                    .eq('id', conversationId)
                    .maybeSingle();
                if (raceRow && !ownsDiagnosis(raceRow, identity)) {
                    return NextResponse.json({ error: 'Not found' }, { status: 404 });
                }
                const { data: retryUpdated, error: retryErr } = await admin
                    .from('diagnoses')
                    .update({
                        ...patch,
                        ...claimPatch(raceRow ?? { user_id: null, anon_key: null }, identity),
                    })
                    .eq('id', conversationId)
                    .select('id');
                if (retryErr) {
                    return NextResponse.json({ error: retryErr.message }, { status: 500 });
                }
                if (Array.isArray(retryUpdated) && retryUpdated.length > 0) {
                    return respondOk();
                }
            }
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        return respondOk();
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
