// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    ADMIN_PASSWORD, RESEND_API_KEY, RESEND_FROM

/**
 * POST /api/admin/provider-applications/resend-confirmation
 * Resends the Stage 1 confirmation email to a provider application.
 * Admin-only (cookie auth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendScandioEmail, confirmationEmail } from '@/lib/resend-mail';
import { requireAdmin } from '@/lib/auth/admin-auth';


export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = await req.json().catch(() => null);
    const id   = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing application id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    const { data: app, error: fetchError } = await admin
        .from('provider_applications')
        .select('id, contact_name, business_name, email')
        .eq('id', id)
        .single();

    if (fetchError || !app) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const firstName = (app.contact_name as string).split(/\s+/)[0] ?? app.contact_name as string;
    const { text, html } = confirmationEmail(firstName, (app.business_name as string | null) ?? '');

    const result = await sendScandioEmail({
        to:      { email: app.email as string, name: app.contact_name as string },
        subject: 'We received your Menda application',
        text,
        html,
    });

    const patch = result.ok
        ? {
              confirmation_email_status:  'sent',
              confirmation_email_sent_at: new Date().toISOString(),
              confirmation_email_error:   null,
          }
        : {
              confirmation_email_status: 'failed',
              confirmation_email_error:  result.error,
          };

    await admin.from('provider_applications').update(patch).eq('id', id);

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
