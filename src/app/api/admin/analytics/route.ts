// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

export async function GET(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') === '7d' ? 7 : 0; // 0 = today only

    const cutoff = new Date();
    if (period === 7) {
        cutoff.setDate(cutoff.getDate() - 7);
        cutoff.setHours(0, 0, 0, 0);
    } else {
        cutoff.setHours(0, 0, 0, 0);
    }

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('diagnosis_events')
        .select('id, session_id, event_type, provider_id, diagnosis_id, created_at')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}
