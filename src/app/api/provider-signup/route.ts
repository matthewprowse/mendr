import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            company_name,
            email,
            descriptive_text,
            team_size,
            spend_per_month,
            price_per_lead,
            report_conversation_id,
            marketing_consent,
        } = body;

        if (!company_name?.trim() || !email?.trim()) {
            return NextResponse.json(
                { error: 'Company name and email are required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from('provider_signups').insert({
            company_name: company_name.trim(),
            email: email.trim(),
            descriptive_text: descriptive_text?.trim() || null,
            team_size: team_size?.trim() || null,
            spend_per_month: spend_per_month?.trim() || null,
            price_per_lead: price_per_lead?.trim() || null,
            report_conversation_id: report_conversation_id || null,
            marketing_consent: !!marketing_consent,
        });

        if (error) {
            console.error('Provider signup error:', error);
            return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Provider signup error:', e);
        return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
    }
}
