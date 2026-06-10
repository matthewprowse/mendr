/**
 * Shared authentication / authorization guards (finding M12).
 *
 * ~60 routes use the service-role client and hand-write identity + ownership
 * checks — the direct cause of the C4/C5/C6/H5 IDORs. These guards resolve
 * identity and ownership once so routes stop re-implementing them. They build on
 * the focused ownership helpers in lib/diagnosis/ownership and
 * lib/providers/ownership.
 *
 * Two shapes are provided:
 *   - guard functions (requireUser / requireProvider / requireOwnedDiagnosis)
 *     that a handler calls at the top and short-circuits on the NextResponse;
 *   - HOF wrappers (withAuth / withProvider) for routes with no dynamic params.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    resolveDiagnosisIdentity,
    ownsDiagnosis,
    type DiagnosisIdentity,
    type DiagnosisOwner,
} from '@/lib/diagnosis/ownership';
import { userOwnsProvider } from '@/lib/providers/ownership';

export type UserContext = { userId: string };
export type ProviderContext = UserContext & { providerId: string };

function unauthorized(): NextResponse {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
}

/** Resolve the authenticated user, or a 401 response. */
export async function requireUser(): Promise<UserContext | NextResponse> {
    try {
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return unauthorized();
        return { userId: user.id };
    } catch {
        return unauthorized();
    }
}

/** Resolve the authenticated user AND a provider they own (via their approved
 *  application → matched_provider_id), or a 401/403 response. */
export async function requireProvider(providerId: string): Promise<ProviderContext | NextResponse> {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const admin = await createSupabaseAdminClient();
    if (!(await userOwnsProvider(admin, user.userId, providerId))) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    return { userId: user.userId, providerId };
}

/** Resolve the caller's diagnosis identity and verify they own the row with the
 *  given id, returning the owner columns or a 404. */
export async function requireOwnedDiagnosis(
    req: NextRequest,
    id: string,
): Promise<{ identity: DiagnosisIdentity; owner: DiagnosisOwner } | NextResponse> {
    const identity = await resolveDiagnosisIdentity(req);
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('diagnoses')
        .select('user_id, anon_key')
        .eq('id', id)
        .maybeSingle();
    const owner = (data ?? null) as DiagnosisOwner | null;
    if (!owner || !ownsDiagnosis(owner, identity)) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    return { identity, owner };
}

/** HOF: wrap a handler so it only runs for an authenticated user. The resolved
 *  UserContext is passed as the second argument. For routes with no dynamic
 *  segment params. */
export function withAuth(
    handler: (req: NextRequest, ctx: UserContext) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
    return async (req: NextRequest) => {
        const ctx = await requireUser();
        if (ctx instanceof NextResponse) return ctx;
        return handler(req, ctx);
    };
}
