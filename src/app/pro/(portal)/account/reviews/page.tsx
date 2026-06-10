import { redirect } from 'next/navigation';
import {
    createSupabaseAdminClient,
    createSupabaseServerClient,
} from '@/lib/auth/supabase-server';
import ReviewsClient, { type ReviewRow } from './client';

export const metadata = {
    title: 'Reviews | Mendr Contractors',
    robots: { index: false, follow: false },
};

async function resolveProviderForUser(userId: string): Promise<string | null> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('provider_applications')
        .select('matched_provider_id, status')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .not('matched_provider_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data?.matched_provider_id ? String(data.matched_provider_id) : null;
}

async function loadReviews(providerId: string): Promise<ReviewRow[]> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('job_outcomes')
        .select(
            'id, rating, outcome, created_at, contractor_reply, contractor_reply_at',
        )
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(20);
    const rows = (data as Array<{
        id: string;
        rating: number | null;
        outcome: string | null;
        created_at: string;
        contractor_reply: string | null;
        contractor_reply_at: string | null;
    }> | null) ?? [];
    return rows.map((r) => ({
        id: r.id,
        rating: typeof r.rating === 'number' ? r.rating : null,
        outcome: r.outcome ?? null,
        createdAt: r.created_at,
        contractorReply: r.contractor_reply ?? null,
        contractorReplyAt: r.contractor_reply_at ?? null,
    }));
}

export default async function ContractorReviewsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/pro/auth/login?next=/pro/account/reviews');
    }

    const providerId = await resolveProviderForUser(user.id);
    if (!providerId) {
        return (
            <div className="flex w-full flex-col gap-3">
                <h1 className="text-2xl font-semibold text-foreground">Reviews</h1>
                <p className="text-sm text-muted-foreground">
                    Reviews appear here once your application is approved and homeowners rate
                    completed jobs.
                </p>
            </div>
        );
    }

    const reviews = await loadReviews(providerId);
    return <ReviewsClient reviews={reviews} />;
}
