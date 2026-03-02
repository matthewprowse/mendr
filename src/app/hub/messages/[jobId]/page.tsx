'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Paperclip } from '@/lib/icons';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

type JobMessage = {
    id: string;
    job_id: string;
    sender_id: string;
    sender_type: 'customer' | 'pro';
    content: string;
    attachment_urls: { url: string; type?: string; filename?: string }[];
    created_at: string;
};

type JobInfo = {
    id: string;
    category: string;
    status: string;
    provider_id: string | null;
};

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageThreadPage() {
    const params = useParams();
    const router = useRouter();
    const jobId = params?.jobId as string | undefined;
    const { user } = useAuth();
    const [job, setJob] = useState<JobInfo | null>(null);
    const [providerName, setProviderName] = useState<string>('Pro');
    const [messages, setMessages] = useState<JobMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState('');
    const [sending, setSending] = useState(false);

    const loadJobAndMessages = useCallback(async () => {
        if (!jobId || !user?.id) return;
        const { data: jobData, error: jobError } = await supabase
            .from('jobs')
            .select('id, category, status, provider_id')
            .eq('id', jobId)
            .eq('client_id', user.id)
            .maybeSingle();
        if (jobError || !jobData) {
            setLoading(false);
            router.replace('/hub/messages');
            return;
        }
        setJob(jobData as JobInfo);
        if (jobData.provider_id) {
            const [{ data: profile }, { data: pp }] = await Promise.all([
                supabase.from('profiles').select('first_name, surname').eq('id', jobData.provider_id).maybeSingle(),
                supabase.from('provider_profiles').select('slug').eq('id', jobData.provider_id).maybeSingle(),
            ]);
            if (profile?.first_name || profile?.surname) {
                setProviderName([profile.first_name, profile.surname].filter(Boolean).join(' ').trim());
            } else if (pp?.slug) {
                setProviderName(pp.slug.replace(/-/g, ' '));
            }
        }
        const { data: msgs, error: msgsError } = await supabase
            .from('job_messages')
            .select('id, job_id, sender_id, sender_type, content, attachment_urls, created_at')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true });
        if (!msgsError) setMessages((msgs as JobMessage[]) ?? []);
        setLoading(false);
    }, [jobId, user?.id, router]);

    useEffect(() => {
        loadJobAndMessages();
    }, [loadJobAndMessages]);

    const sendMessage = async () => {
        if (!jobId || !user?.id || !content.trim() || sending) return;
        setSending(true);
        const { error } = await supabase.from('job_messages').insert({
            job_id: jobId,
            sender_id: user.id,
            sender_type: 'customer',
            content: content.trim(),
            attachment_urls: [],
        });
        setSending(false);
        if (error) {
            toast.error('Failed to send message');
            return;
        }
        setContent('');
        loadJobAndMessages();
    };

    if (loading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className="mx-auto flex max-w-2xl flex-col px-4 py-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/hub/messages" aria-label="Back to messages">
                        <ArrowLeft className="size-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="font-semibold text-foreground">{providerName}</h1>
                    <p className="text-xs text-muted-foreground">
                        Job · {job.category} · {job.status}
                    </p>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-muted/20 p-4 min-h-[300px]">
                {messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No messages yet. Send a message to start the conversation.
                    </p>
                ) : (
                    messages.map((m) => (
                        <div
                            key={m.id}
                            className={`flex ${m.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                                    m.sender_type === 'customer'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-foreground'
                                }`}
                            >
                                {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                                {m.attachment_urls?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {m.attachment_urls.map((a, i) => (
                                            <a
                                                key={i}
                                                href={a.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs underline opacity-90"
                                            >
                                                {a.filename || 'Attachment'}
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <p
                                    className={`mt-1 text-xs opacity-80 ${
                                        m.sender_type === 'customer' ? 'text-right' : 'text-left'
                                    }`}
                                >
                                    {formatTime(m.created_at)}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 flex gap-2">
                <Button variant="outline" size="icon" className="shrink-0" aria-label="Attach file" disabled>
                    <Paperclip className="size-4" />
                </Button>
                <Textarea
                    placeholder="Type a message..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    className="min-h-[44px] resize-none"
                    rows={1}
                />
                <Button onClick={sendMessage} disabled={!content.trim() || sending} className="shrink-0">
                    Send
                </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                Image, document and video upload coming soon.
            </p>
        </div>
    );
}
