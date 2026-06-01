import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const admin = await createSupabaseAdminClient();
    const userId = user.id;

    const [profileResult, diagnosesResult, savedResult, contactResult] = await Promise.all([
        admin.from('profiles').select('first_name, surname, username, description, locations, created_at').eq('user_id', userId).maybeSingle(),
        admin.from('diagnoses').select('id, title, customer_address, diagnosis, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        admin.from('saved_providers').select('provider_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        admin.from('provider_contact_events').select('id, channel, created_at, conversation_id').in(
            'conversation_id',
            // Sub-select diagnosis IDs for this user
            (await admin.from('diagnoses').select('id').eq('user_id', userId)).data?.map(d => d.id) ?? []
        ).order('created_at', { ascending: false }),
    ]);

    const exportData = {
        exported_at: new Date().toISOString(),
        account: {
            email: user.email,
            created_at: user.created_at,
        },
        profile: profileResult.data ?? null,
        requests: diagnosesResult.data ?? [],
        saved_contractors: savedResult.data ?? [],
        contact_history: contactResult.data ?? [],
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="mendr-data-export-${new Date().toISOString().split('T')[0]}.json"`,
        },
    });
}
