// Required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

function pickDiagnosisStrings(
    diagnosis: unknown
): { diagnosis?: string; trade?: string } {
    if (!diagnosis || typeof diagnosis !== 'object') return {};
    const d = diagnosis as Record<string, unknown>;
    const diagnosisText =
        typeof d.diagnosis === 'string' && d.diagnosis.trim() ? d.diagnosis.trim() : undefined;
    const trade =
        typeof d.trade === 'string' && d.trade.trim() ? d.trade.trim() : undefined;
    return { diagnosis: diagnosisText, trade };
}

/**
 * GET /api/report-info?conversation_id=...
 * Used client-side to build WhatsApp prefill.
 * Reports are public/shareable so this endpoint only returns non-sensitive summary fields.
 */
export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'reportInfo');
    if (limited) return limited;

    const conversationId = req.nextUrl.searchParams.get('conversation_id')?.trim() ?? '';
    if (!conversationId) {
        return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: conv, error } = await supabase
        .from('diagnoses')
        .select('id, diagnosis, initial_image_description, is_direct_match')
        .eq('id', conversationId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const diagObj = (conv as any).diagnosis ?? null;
    const { diagnosis, trade } = pickDiagnosisStrings(diagObj);

    // For direct-match users (no diagnosis), fall back to the initial image description.
    const isDirectMatch = Boolean((conv as any).is_direct_match);
    const fallbackDescription =
        typeof (conv as any).initial_image_description === 'string' &&
        (conv as any).initial_image_description.trim()
            ? (conv as any).initial_image_description.trim()
            : undefined;

    const report_url = `${req.nextUrl.origin}/report/${encodeURIComponent(conversationId)}`;

    return NextResponse.json({
        diagnosis: diagnosis ?? fallbackDescription ?? 'Home repair or maintenance',
        trade,
        report_url,
        is_direct_match: isDirectMatch,
    });
}

