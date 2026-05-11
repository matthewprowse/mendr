/**
 * POST /api/admin/provider-applications/resend-confirmation
 * Resends the Stage 1 confirmation email to a provider application.
 * Admin-only (cookie auth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendScandioEmail, confirmationEmail } from '@/lib/sendgrid-mail';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

export async function POST(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        subject: 'We received your Scandio application',
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
