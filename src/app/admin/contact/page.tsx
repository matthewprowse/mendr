'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

type Status = 'unread' | 'read' | 'replied';

type ContactMessage = {
    id: string;
    created_at: string;
    name: string;
    email: string;
    subject: string | null;
    message: string;
    status: Status;
    replied_at: string | null;
    reply_text: string | null;
};

const STATUS_STYLES: Record<Status, string> = {
    unread:  'bg-blue-100 text-blue-700',
    read:    'bg-muted text-muted-foreground',
    replied: 'bg-green-100 text-green-700',
};

export default function AdminContactPage() {
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ContactMessage | null>(null);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/contact');
        if (res.ok) setMessages(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    function openMessage(msg: ContactMessage) {
        setSelected(msg);
        setReplyText(
            `Dear ${msg.name},\n\n[your reply here]\n\nKind regards,\nThe Scandio Team`
        );
        // Mark as read if unread.
        if (msg.status === 'unread') {
            void fetch('/api/admin/contact', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: msg.id, status: 'read' }),
            });
            setMessages((prev) =>
                prev.map((m) => (m.id === msg.id ? { ...m, status: 'read' } : m))
            );
        }
    }

    async function handleReply() {
        if (!selected) return;
        setSending(true);
        try {
            const res = await fetch('/api/admin/send-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: selected.id,
                    email: selected.email,
                    name: selected.name,
                    subject: selected.subject,
                    replyText,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                toast.error((d as any)?.error || 'Failed to send reply');
                return;
            }
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === selected.id
                        ? { ...m, status: 'replied', replied_at: new Date().toISOString(), reply_text: replyText }
                        : m
                )
            );
            toast.success(`Reply sent to ${selected.email}`);
            setSelected(null);
        } finally {
            setSending(false);
        }
    }

    async function markRead(id: string) {
        await fetch('/api/admin/contact', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'read' }),
        });
        setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, status: 'read' } : m))
        );
        setSelected(null);
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Contact Messages</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {messages.filter((m) => m.status === 'unread').length} unread
                </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="min-w-full divide-y divide-border/50 text-sm">
                    <thead className="bg-muted/30">
                        <tr>
                            {['Date', 'Name', 'Email', 'Subject', 'Status', ''].map((h) => (
                                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 bg-background">
                        {loading ? (
                            <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Loading…</td></tr>
                        ) : messages.length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No messages yet.</td></tr>
                        ) : (
                            messages.map((m) => (
                                <tr
                                    key={m.id}
                                    className="cursor-pointer hover:bg-muted/20"
                                    onClick={() => openMessage(m)}
                                >
                                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                        {new Date(m.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                    </td>
                                    <td className={`px-3 py-2 ${m.status === 'unread' ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                                        {m.name}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">{m.email}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{m.subject ?? '—'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status]}`}>
                                            {m.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">View →</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Drawer */}
            <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                <SheetContent className="w-full max-w-lg overflow-y-auto sm:max-w-xl">
                    {selected && (
                        <div className="flex flex-col gap-6 pb-8">
                            <SheetHeader>
                                <SheetTitle>Message from {selected.name}</SheetTitle>
                            </SheetHeader>

                            {/* Sender details */}
                            <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                                <p className="font-medium text-foreground">{selected.name}</p>
                                <p className="text-muted-foreground">{selected.email}</p>
                                {selected.subject && <p className="text-xs text-muted-foreground">Subject: {selected.subject}</p>}
                                <p className="text-xs text-muted-foreground">
                                    {new Date(selected.created_at).toLocaleString('en-ZA')}
                                </p>
                            </div>

                            {/* Message body */}
                            <div className="rounded-lg border border-border/50 bg-background p-4">
                                <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                                    {selected.message}
                                </p>
                            </div>

                            {/* Actions */}
                            {selected.status !== 'read' && selected.status !== 'replied' ? null : null}

                            {selected.status !== 'replied' && (
                                <div className="flex flex-col gap-3">
                                    <Label>Reply</Label>
                                    <Textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        rows={8}
                                        className="text-sm"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => void handleReply()}
                                            disabled={sending || !replyText}
                                            className="flex-1"
                                        >
                                            {sending ? 'Sending…' : 'Send Reply'}
                                        </Button>
                                        {selected.status === 'unread' && (
                                            <Button
                                                variant="secondary"
                                                onClick={() => void markRead(selected.id)}
                                            >
                                                Mark Read
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selected.status === 'replied' && (
                                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                                    <p className="font-medium text-green-700">Reply sent</p>
                                    {selected.replied_at && (
                                        <p className="text-xs text-green-600">
                                            {new Date(selected.replied_at).toLocaleString('en-ZA')}
                                        </p>
                                    )}
                                    {selected.reply_text && (
                                        <p className="mt-2 whitespace-pre-wrap text-xs text-green-700 opacity-80">
                                            {selected.reply_text}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
