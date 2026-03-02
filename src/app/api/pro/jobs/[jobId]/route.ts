import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getClientMetadata, logJobAudit, JOB_AUDIT_ACTIONS } from '@/lib/audit-log';

type Params = { params: Promise<{ jobId: string }> };

/**
 * PATCH: Update job (status, is_paid, payment_proof_url).
 * Body: { status?: 'quoted' | 'active' | 'completed' | 'cancelled', is_paid?: boolean, payment_proof_url?: string }
 * Phase 6: Every status change and payment change is audited via logJobAudit.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const { jobId } = await params;
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { status, is_paid, payment_proof_url } = body;

        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('id, status, provider_id, is_paid, payment_proof_url')
            .eq('id', jobId)
            .single();

        if (fetchError || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }
        if (job.provider_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const metadata = await getClientMetadata({ headers: req.headers });
        const auditOpts = { metadata };

        if (status === 'quoted' && job.status === 'lead') {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'quoted', updated_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                console.error('Job update error:', updateError);
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            await logJobAudit(supabase, JOB_AUDIT_ACTIONS.LEAD_ACCEPTED, jobId, { previous_status: 'lead' }, auditOpts);
            return NextResponse.json({ ok: true });
        }

        if (status === 'active' && job.status === 'quoted') {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'active', updated_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            await logJobAudit(supabase, JOB_AUDIT_ACTIONS.JOB_ACTIVATED, jobId, { previous_status: 'quoted' }, auditOpts);
            return NextResponse.json({ ok: true });
        }

        if (status === 'completed' && (job.status === 'active' || job.status === 'quoted')) {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            await logJobAudit(supabase, JOB_AUDIT_ACTIONS.JOB_COMPLETED, jobId, { previous_status: job.status }, auditOpts);
            return NextResponse.json({ ok: true });
        }

        if (typeof is_paid === 'boolean') {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ is_paid, updated_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            await logJobAudit(
                supabase,
                JOB_AUDIT_ACTIONS.PAYMENT_VERIFIED,
                jobId,
                { is_paid, previous_is_paid: job.is_paid ?? false },
                auditOpts
            );
            return NextResponse.json({ ok: true });
        }

        if (typeof payment_proof_url === 'string' && payment_proof_url) {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ payment_proof_url, updated_at: new Date().toISOString() })
                .eq('id', jobId);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            await logJobAudit(
                supabase,
                JOB_AUDIT_ACTIONS.PAYMENT_PROOF_UPLOADED,
                jobId,
                { payment_proof_url },
                auditOpts
            );
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Invalid status transition or no updatable fields' }, { status: 400 });
    } catch (e) {
        console.error('Job PATCH error:', e);
        return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }
}
