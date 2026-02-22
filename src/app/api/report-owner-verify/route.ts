import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { conversation_id, token } = body;

        if (!conversation_id || !token) {
            return NextResponse.json(
                { error: 'conversation_id and token are required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();
        const { data } = await supabase
            .from('report_owner_tokens')
            .select('conversation_id')
            .eq('conversation_id', conversation_id)
            .eq('token', token)
            .maybeSingle();

        return NextResponse.json({ valid: !!data });
    } catch (e: any) {
        console.error('Report owner verify error:', e);
        return NextResponse.json(
            { error: e?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
