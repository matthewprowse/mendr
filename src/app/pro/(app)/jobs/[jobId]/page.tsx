import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import { JobDetailClient } from './_components/job-detail-client';

export const metadata: Metadata = {
    title: 'Job',
    description: 'Job details and customer thread.',
};

type Props = { params: Promise<{ jobId: string }> };

export default async function ProJobPage({ params }: Props) {
    const { jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/jobs/' + jobId);
    }

    const { data: job, error } = await supabase
        .from('jobs')
        .select('id, status, category, service_address, created_at, updated_at, client_id, initial_diagnosis_id, current_quote, is_paid, payment_proof_url, conversation_id')
        .eq('id', jobId)
        .eq('provider_id', user.id)
        .single();

    if (error || !job) {
        notFound();
    }

    let client = null;
    let diagnosisSummary: string | null = null;
    let reportId: string | null = null;

    if (job.client_id) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, first_name, surname')
            .eq('id', job.client_id)
            .single();
        client = profile;
    }

    if (job.initial_diagnosis_id) {
        const { data: diag } = await supabase
            .from('diagnoses')
            .select('diagnosis, conversation_id')
            .eq('id', job.initial_diagnosis_id)
            .single();
        if (diag?.diagnosis && typeof diag.diagnosis === 'object') {
            const d = diag.diagnosis as { summary?: string; category?: string };
            diagnosisSummary = d.summary ?? d.category ?? JSON.stringify(d).slice(0, 200);
        }
        const { data: report } = await supabase
            .from('scandio_reports')
            .select('id')
            .eq('diagnosis_id', job.initial_diagnosis_id)
            .limit(1)
            .maybeSingle();
        reportId = report?.id ?? null;
    }

    const quote = (job.current_quote as { parts?: unknown[]; labour?: unknown[]; total?: number }) ?? {};

    return (
        <JobDetailClient
            job={{
                id: job.id,
                status: job.status,
                category: job.category,
                service_address: job.service_address ?? null,
                created_at: job.created_at,
                updated_at: job.updated_at,
                client_id: job.client_id,
                is_paid: job.is_paid ?? false,
                payment_proof_url: job.payment_proof_url ?? null,
            }}
            client={client}
            diagnosisSummary={diagnosisSummary}
            reportId={reportId}
            quote={quote}
        />
    );
}
