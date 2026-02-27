import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getClientMetadata, logScandioEvent } from '@/lib/audit-log';

const VALID_TYPES = ['whatsapp', 'phone', 'email'] as const;

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const body = await req.json();
        const { conversation_id, provider_place_id, provider_name, contact_type } = body;

        if (!contact_type || !VALID_TYPES.includes(contact_type)) {
            return NextResponse.json({ error: 'Invalid or missing contact_type' }, { status: 400 });
        }

        const { data: lead, error } = await supabase
            .from('leads')
            .insert({
                conversation_id: conversation_id || null,
                provider_place_id: provider_place_id || null,
                provider_name: provider_name || null,
                contact_type,
            })
            .select('id')
            .single();

        if (error) {
            console.error('Leads insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const metadata = await getClientMetadata({ headers: req.headers });
        await logScandioEvent(
            supabase,
            {
                action: 'LEAD_CREATED',
                type: 'TRANSACTIONAL',
                entityId: lead?.id,
                entityType: 'leads',
                payload: {
                    conversation_id: conversation_id || null,
                    provider_place_id: provider_place_id || null,
                    contact_type,
                },
            },
            { metadata }
        );

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Leads API error:', e);
        return NextResponse.json({ error: 'Failed to record lead' }, { status: 500 });
    }
}
