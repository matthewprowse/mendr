import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { conversation_id, pin } = body;

        if (!conversation_id || !pin) {
            return NextResponse.json(
                { error: 'conversation_id and pin are required' },
                { status: 400 }
            );
        }

        const pinStr = String(pin).replace(/\D/g, '');
        if (pinStr.length !== 4) {
            return NextResponse.json({ valid: false });
        }

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase
            .from('report_access')
            .select('provider_place_id')
            .eq('conversation_id', conversation_id)
            .eq('pin', pinStr)
            .maybeSingle();

        if (error) {
            console.error('Report verify error:', error);
            return NextResponse.json(
                { error: 'Verification failed' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            valid: !!data,
            provider_place_id: data?.provider_place_id ?? null,
        });
    } catch (e: any) {
        console.error('Report verify error:', e);
        return NextResponse.json(
            { error: e?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
