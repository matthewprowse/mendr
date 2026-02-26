import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { conversation_id, message_id, diagnosis_message } = body;

        if (!conversation_id) {
            return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from('feedback_unrelated').insert({
            conversation_id: conversation_id,
            message_id: message_id || null,
            diagnosis_message: diagnosis_message?.trim() || null,
        });

        if (error) {
            console.error('Feedback unrelated error:', error);
            return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('Feedback unrelated error:', e);
        return NextResponse.json(
            { error: (e as Error)?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
