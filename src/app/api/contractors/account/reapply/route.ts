import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'contractorReapply');
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    let applicationId: string | undefined;
    try {
        const body = (await req.json().catch(() => null)) as { applicationId?: unknown } | null;
        applicationId = typeof body?.applicationId === 'string' ? body.applicationId.trim() : undefined;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!applicationId) {
        return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    // Fetch the original rejected application owned by this user
    const { data: original, error: fetchError } = await admin
        .from('provider_applications')
        .select('*')
        .eq('id', applicationId)
        .eq('user_id', user.id)
        .eq('status', 'rejected')
        .maybeSingle();

    if (fetchError) {
        console.error('[reapply] fetch error:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch application.' }, { status: 500 });
    }

    if (!original) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    // Check for an existing active application
    const { data: existing, error: existingError } = await admin
        .from('provider_applications')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['new', 'contacted'])
        .maybeSingle();

    if (existingError) {
        console.error('[reapply] existing check error:', existingError);
        return NextResponse.json({ error: 'Failed to check existing applications.' }, { status: 500 });
    }

    if (existing) {
        return NextResponse.json(
            { error: 'You already have an active application under review.' },
            { status: 409 }
        );
    }

    // Build clone — exclude lifecycle/audit fields that should not be copied
    const EXCLUDE_KEYS = new Set([
        'id',
        'created_at',
        'updated_at',
        'status',
        'rejection_reason',
        'resubmission_of',
        'confirmation_email_status',
        'confirmation_email_sent_at',
        'confirmation_email_error',
        'invitation_email_status',
        'invitation_email_sent_at',
        'invitation_email_error',
        'invitation_email_url',
        'enrichment_status',
        'enrichment_queued_at',
        'enrichment_started_at',
        'enrichment_completed_at',
        'enrichment_error',
        'enrichment_version',
        'matched_provider_id',
        'gemini_summary',
        'gemini_summary_generated_at',
        'applicant_edited_at',
        'applicant_summary',
        'applicant_profile_edits',
    ]);

    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(original as Record<string, unknown>)) {
        if (!EXCLUDE_KEYS.has(key)) {
            clone[key] = value;
        }
    }

    clone.status = 'new';
    clone.resubmission_of = applicationId;
    clone.user_id = user.id;

    const { data: inserted, error: insertError } = await admin
        .from('provider_applications')
        .insert(clone)
        .select('id')
        .single();

    if (insertError || !inserted?.id) {
        console.error('[reapply] insert error:', insertError);
        return NextResponse.json({ error: 'Failed to create new application.' }, { status: 500 });
    }

    return NextResponse.json({ id: inserted.id as string });
}
