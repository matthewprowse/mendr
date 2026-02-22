import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { randomBytes } from 'crypto';

function generateToken(): string {
    return randomBytes(24).toString('base64url');
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const conversation_id = searchParams.get('conversation_id');

        if (!conversation_id) {
            return NextResponse.json(
                { error: 'conversation_id is required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();

        const { data: existing } = await supabase
            .from('report_owner_tokens')
            .select('token')
            .eq('conversation_id', conversation_id)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ token: existing.token });
        }

        const token = generateToken();
        const { error } = await supabase.from('report_owner_tokens').insert({
            conversation_id,
            token,
        });

        if (error) {
            return NextResponse.json(
                { error: 'Failed to create token' },
                { status: 500 }
            );
        }

        return NextResponse.json({ token });
    } catch (e: any) {
        console.error('Report owner token error:', e);
        return NextResponse.json(
            { error: e?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
