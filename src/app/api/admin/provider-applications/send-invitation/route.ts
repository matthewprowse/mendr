/**
 * POST /api/admin/provider-applications/send-invitation
 *
 * Admin-triggered Stage 3 action: creates a fresh secure edit token,
 * revokes any unused prior tokens, and emails the applicant a link to
 * review and edit their Gemini-generated profile summary.
 *
 * Requires: gemini_summary to be present on the application row (or
 *           pass `force: true` to send without a summary).
 *
 * Admin-only (cookie auth).
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendScandioEmail, invitationEmail } from '@/lib/sendgrid-mail';
import { getSiteUrl } from '@/lib/site-url';
import { requireAdmin } from '@/lib/admin-auth';


const TOKEN_TTL_DAYS = 14;

function generateToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw      = crypto.randomBytes(32).toString('hex');
    const hash     = crypto.createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS);
    return { raw, hash, expiresAt };
}

export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body  = await req.json().catch(() => null);
    const id    = typeof body?.id    === 'string'  ? body.id.trim()   : '';
    const force = body?.force === true;

    if (!id) return NextResponse.json({ error: 'Missing application id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    // Fetch the application
    const { data: app, error: fetchError } = await admin
        .from('provider_applications')
        .select('id, contact_name, email, gemini_summary, applicant_summary')
        .eq('id', id)
        .single();

    if (fetchError || !app) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const summary = (app.applicant_summary || app.gemini_summary) as string | null;
    if (!summary && !force) {
        return NextResponse.json(
            { error: 'No Gemini summary yet. Run enrichment first, or pass force: true.' },
            { status: 422 },
        );
    }

    // Revoke any unused prior tokens for this application
    await admin
        .from('provider_application_edit_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('provider_application_id', id)
        .is('used_at', null)
        .is('revoked_at', null);

    // Create a new token
    const { raw, hash, expiresAt } = generateToken();
    const { error: tokenError } = await admin
        .from('provider_application_edit_tokens')
        .insert({
            provider_application_id: id,
            token_hash:              hash,
            expires_at:              expiresAt.toISOString(),
        });

    if (tokenError) {
        return NextResponse.json({ error: `Token creation failed: ${tokenError.message}` }, { status: 500 });
    }

    // Build the secure edit URL
    const base    = getSiteUrl();
    const editUrl = `${base}/contractors/application/edit?token=${raw}`;

    // Send invitation email
    const firstName         = (app.contact_name as string).split(/\s+/)[0] ?? app.contact_name as string;
    const { text, html }    = invitationEmail(
        firstName,
        summary ?? '[Profile summary will be added by the Scandio team.]',
        editUrl,
    );

    const result = await sendScandioEmail({
        to:      { email: app.email as string, name: app.contact_name as string },
        subject: 'Your Scandio profile is ready to review',
        text,
        html,
    });

    // Persist invitation email status
    const patch = result.ok
        ? {
              invitation_email_status:  'sent',
              invitation_email_sent_at: new Date().toISOString(),
              invitation_email_error:   null,
          }
        : {
              invitation_email_status: 'failed',
              invitation_email_error:  result.error,
          };

    await admin.from('provider_applications').update(patch).eq('id', id);

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
