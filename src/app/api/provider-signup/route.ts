import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { formatApiError } from '@/lib/utils';

/** Maps request body to DB columns. Supports both legacy and current field names. */
function mapSignupBody(body: Record<string, unknown>) {
    const phone =
        (body.phone as string)?.trim() || (body.contact_number as string)?.trim() || null;
    const maps_link =
        (body.maps_link as string)?.trim() || (body.google_maps_link as string)?.trim() || null;
    const description =
        (body.description as string)?.trim() || (body.descriptive_text as string)?.trim() || null;
    const marketing_budget =
        (body.marketing_budget as string)?.trim() || (body.spend_per_month as string)?.trim() || null;
    const lead_price =
        (body.lead_price as string)?.trim() || (body.price_per_lead as string)?.trim() || null;

    return {
        company_name: (body.company_name as string)?.trim(),
        email: (body.email as string)?.trim(),
        phone,
        maps_link,
        service_id: (body.service_id as string) || null,
        description,
        team_size: (body.team_size as string)?.trim() || null,
        marketing_budget,
        lead_price,
        report_conversation_id: (body.report_conversation_id as string) || null,
        marketing_consent: !!body.marketing_consent,
        address: (body.address as string)?.trim() || null,
        lat: body.lat != null ? Number(body.lat) : null,
        lng: body.lng != null ? Number(body.lng) : null,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const mapped = mapSignupBody(body);

        if (!mapped.company_name || !mapped.email) {
            return NextResponse.json(
                { error: 'Company name and email are required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from('provider_signups').insert({
            company_name: mapped.company_name,
            email: mapped.email,
            phone: mapped.phone,
            maps_link: mapped.maps_link,
            service_id: mapped.service_id,
            description: mapped.description,
            team_size: mapped.team_size,
            marketing_budget: mapped.marketing_budget,
            lead_price: mapped.lead_price,
            report_conversation_id: mapped.report_conversation_id,
            marketing_consent: mapped.marketing_consent,
            address: mapped.address,
            lat: mapped.lat,
            lng: mapped.lng,
        });

        if (error) {
            console.error('Provider signup error:', error);
            return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('Provider signup error:', e);
        return NextResponse.json({ error: formatApiError(e) }, { status: 500 });
    }
}
