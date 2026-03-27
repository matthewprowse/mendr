import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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
    const conversationId = req.nextUrl.searchParams.get('conversation_id')?.trim() ?? '';
    if (!conversationId) {
        return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    // Support both 'diagnosis' (new) and 'diagnosis_json' (legacy) column names.
    const { data: conv, error } = await supabase
        .from('conversations')
        .select('id, diagnosis, diagnosis_json')
        .eq('id', conversationId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const diagObj = (conv as any).diagnosis ?? (conv as any).diagnosis_json ?? null;
    const { diagnosis, trade } = pickDiagnosisStrings(diagObj);

    const report_url = `${req.nextUrl.origin}/report/${encodeURIComponent(conversationId)}`;

    return NextResponse.json({
        diagnosis: diagnosis ?? 'Home repair or maintenance',
        trade,
        report_url,
    });
}

