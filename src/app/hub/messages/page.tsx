'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Message } from '@/lib/icons';
import { Spinner } from '@/components/ui/spinner';

type JobRow = {
    id: string;
    status: string;
    category: string;
    created_at: string;
    provider_id: string | null;
    provider_profile?: { slug: string | null } | null;
    profile?: { first_name: string | null; surname: string | null } | null;
    last_message?: { content: string; created_at: string } | null;
};

function formatRelative(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { dateStyle: 'short' });
}

function getProviderDisplayName(job: JobRow): string {
    if (job.profile?.first_name || job.profile?.surname) {
        return [job.profile.first_name, job.profile.surname].filter(Boolean).join(' ').trim();
    }
    if (job.provider_profile?.slug) {
        return job.provider_profile.slug.replace(/-/g, ' ');
    }
    return 'Pro';
}

export default function MessagesListPage() {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<JobRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data: jobsData, error: jobsError } = await supabase
                .from('jobs')
                .select('id, status, category, created_at, updated_at, provider_id')
                .eq('client_id', user.id)
                .order('updated_at', { ascending: false });
            if (jobsError) {
                console.error('Jobs fetch error:', jobsError);
                setJobs([]);
                setLoading(false);
                return;
            }
            const jobList = (jobsData ?? []) as { id: string; status: string; category: string; created_at: string; updated_at: string; provider_id: string | null }[];
            const providerIds = [...new Set(jobList.map((j) => j.provider_id).filter(Boolean))] as string[];
            const [profilesRes, providerProfilesRes, lastMessages] = await Promise.all([
                providerIds.length
                    ? supabase.from('profiles').select('id, first_name, surname').in('id', providerIds)
                    : { data: [] as { id: string; first_name: string | null; surname: string | null }[] },
                providerIds.length
                    ? supabase.from('provider_profiles').select('id, slug').in('id', providerIds)
                    : { data: [] as { id: string; slug: string | null }[] },
                Promise.all(
                    jobList.map((j) =>
                        supabase
                            .from('job_messages')
                            .select('content, created_at')
                            .eq('job_id', j.id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle()
                    )
                ),
            ]);
            type ProfileRow = { id: string; first_name: string | null; surname: string | null };
            const profileMap = new Map<string, ProfileRow>((profilesRes.data ?? []).map((p: ProfileRow) => [p.id, p]));
            const slugMap = new Map<string, { slug: string }>((providerProfilesRes.data ?? []).map((p: { id: string; slug: string }) => [p.id, { slug: p.slug }]));
            const withLastMessage: JobRow[] = jobList.map((j, i) => ({
                ...j,
                provider_profile: j.provider_id ? slugMap.get(j.provider_id) ?? null : null,
                profile: j.provider_id ? profileMap.get(j.provider_id) ?? null : null,
                last_message: lastMessages[i]?.data ?? null,
            }));
            setJobs(withLastMessage);
            setLoading(false);
        })();
    }, [user?.id]);

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[40vh] max-w-2xl items-center justify-center px-4 py-12">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Messages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Your conversations with Pros about jobs.
            </p>

            {jobs.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
                    <Message className="size-12 text-muted-foreground/60" />
                    <p className="mt-4 text-muted-foreground">No messages yet.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        When you have an active job with a Pro, your thread will appear here.
                    </p>
                </div>
            ) : (
                <ul className="mt-8 space-y-2">
                    {jobs.map((job) => (
                        <li key={job.id}>
                            <Link href={`/hub/messages/${job.id}`}>
                                <Card className="transition-colors hover:bg-muted/30">
                                    <CardContent className="flex items-center gap-4 p-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-foreground">
                                                {getProviderDisplayName(job)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Job · {job.category}
                                                {job.last_message && (
                                                    <span className="ml-1">
                                                        · {formatRelative(job.last_message.created_at)}
                                                    </span>
                                                )}
                                            </p>
                                            {job.last_message && (
                                                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                                                    {job.last_message.content || 'Attachment'}
                                                </p>
                                            )}
                                        </div>
                                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                                    </CardContent>
                                </Card>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
