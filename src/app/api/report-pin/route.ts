import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function generatePin(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { conversation_id, provider_place_id } = body;

        if (!conversation_id || !provider_place_id) {
            return NextResponse.json(
                { error: 'conversation_id and provider_place_id are required' },
                { status: 400 }
            );
        }

        const pin = generatePin();
        const supabase = await createSupabaseServerClient();

        const { error } = await supabase.from('report_access').upsert(
            {
                conversation_id,
                provider_place_id,
                pin,
            },
            { onConflict: 'conversation_id,provider_place_id' }
        );

        if (error) {
            console.error('Report PIN upsert error:', error);
            return NextResponse.json(
                { error: 'Failed to generate access code' },
                { status: 500 }
            );
        }

        return NextResponse.json({ pin });
    } catch (e: any) {
        console.error('Report PIN error:', e);
        return NextResponse.json(
            { error: e?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
