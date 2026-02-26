import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { conversation_id, message_id, requested_service, diagnosis, diagnosis_full } = body;

        if (!conversation_id || !requested_service?.trim()) {
            return NextResponse.json(
                { error: 'conversation_id and requested_service are required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from('feedback_unserviced').insert({
            conversation_id,
            message_id: message_id || null,
            requested_service: requested_service.trim(),
            diagnosis: diagnosis?.trim() || null,
            diagnosis_full: diagnosis_full || null,
        });

        if (error) {
            console.error('Feedback unserviced error:', error);
            return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('Feedback unserviced error:', e);
        return NextResponse.json(
            { error: (e as Error)?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
