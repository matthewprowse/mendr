import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            provider_place_id,
            provider_name,
            provider_address,
            subject,
            body: bodyText,
        } = body;

        if (
            !provider_place_id?.trim() ||
            !provider_name?.trim() ||
            !subject?.trim() ||
            !bodyText?.trim()
        ) {
            return NextResponse.json(
                { error: 'Provider, subject, and body are required' },
                { status: 400 }
            );
        }

        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from('provider_reports').insert({
            provider_place_id: provider_place_id.trim(),
            provider_name: provider_name.trim(),
            provider_address: provider_address?.trim() || null,
            subject: subject.trim(),
            body: bodyText.trim(),
        });

        if (error) {
            console.error('Report save error:', error);
            return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Report error:', e);
        return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
    }
}
