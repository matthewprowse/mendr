// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
//
// Admin CRUD for individual early-access codes (see /admin/beta-codes).
// GET    — list codes with redemption stats (total uses + distinct devices).
// POST   — create a code (auto-generated when none supplied).
// PATCH  — update a code (label / note / active / max_uses / expiry).
// DELETE — remove a code (cascades its redemption log).

import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';

// Unambiguous alphabet — no 0/O, 1/I/L — so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(len = 8): string {
    let out = '';
    for (let i = 0; i < len; i++) {
        out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return out;
}

function normalizeCode(raw: string): string {
    return raw.replace(/\s+/g, '').toUpperCase();
}

type RedemptionRow = { code_id: string; ip: string | null; session_id: string | null };

// GET — list codes, newest first, enriched with redemption stats.
export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();

    const { data: codes, error } = await admin
        .from('beta_access_codes')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: redemptions, error: redErr } = await admin
        .from('beta_access_redemptions')
        .select('code_id, ip, session_id');
    if (redErr) return NextResponse.json({ error: redErr.message }, { status: 500 });

    // Distinct ip / session counts per code flag a code being shared around.
    const ips = new Map<string, Set<string>>();
    const sessions = new Map<string, Set<string>>();
    for (const r of (redemptions ?? []) as RedemptionRow[]) {
        if (r.ip) {
            if (!ips.has(r.code_id)) ips.set(r.code_id, new Set());
            ips.get(r.code_id)!.add(r.ip);
        }
        if (r.session_id) {
            if (!sessions.has(r.code_id)) sessions.set(r.code_id, new Set());
            sessions.get(r.code_id)!.add(r.session_id);
        }
    }

    const rows = (codes ?? []).map((c) => ({
        ...c,
        distinct_ips: ips.get(c.id)?.size ?? 0,
        distinct_sessions: sessions.get(c.id)?.size ?? 0,
    }));

    return NextResponse.json(rows);
}

// POST — create a code. Body: { code?, label?, note?, maxUses?, expiresAt? }
export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    const rawCode = typeof body.code === 'string' && body.code.trim() ? body.code : generateCode();
    const code = normalizeCode(rawCode);
    if (!code) return NextResponse.json({ error: 'Code cannot be empty' }, { status: 400 });

    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    const maxUses =
        Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : null;
    const expiresAt =
        typeof body.expiresAt === 'string' && body.expiresAt.trim() ? body.expiresAt : null;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('beta_access_codes')
        .insert({ code, label, note, max_uses: maxUses, expires_at: expiresAt })
        .select('*')
        .single();

    if (error) {
        // 23505 = unique violation → duplicate code.
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json({ error: 'That code already exists.' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...data, distinct_ips: 0, distinct_sessions: 0 });
}

// PATCH — update a code. Body: { id, ...fields }
export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.label === 'string') patch.label = body.label.trim() || null;
    if (typeof body.note === 'string') patch.note = body.note.trim() || null;
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
    if ('max_uses' in body) {
        patch.max_uses =
            Number.isInteger(body.max_uses) && body.max_uses > 0 ? body.max_uses : null;
    }
    if ('expires_at' in body) {
        patch.expires_at =
            typeof body.expires_at === 'string' && body.expires_at.trim() ? body.expires_at : null;
    }
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('beta_access_codes').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

// DELETE — remove a code. Body: { id }
export async function DELETE(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('beta_access_codes').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
