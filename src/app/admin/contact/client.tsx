'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AdminPageHeader } from '../components/page-header';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AdminDataTable } from '../components/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

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
    const [page, setPage] = useState(0);
    const [editDraft, setEditDraft] = useState<ContactMessage | null>(null);
    const PAGE_SIZE = 50;

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/contact');
        if (res.ok) setMessages(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);
    const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
    const paged = messages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    function openMessage(msg: ContactMessage) {
        setSelected(msg);
        setReplyText(
            `Dear ${msg.name},\n\n[your reply here]\n\nKind regards,\nThe Menda Team`
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
    async function saveEdit() {
        if (!editDraft) return;
        const res = await fetch('/api/admin/contact', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editDraft.id,
                name: editDraft.name,
                email: editDraft.email,
                subject: editDraft.subject ?? '',
                message: editDraft.message,
                status: editDraft.status,
            }),
        });
        if (!res.ok) {
            toast.error('Failed to save message');
            return;
        }
        setMessages((prev) => prev.map((m) => (m.id === editDraft.id ? { ...m, ...editDraft } : m)));
        setSelected((prev) => (prev?.id === editDraft.id ? { ...prev, ...editDraft } : prev));
        setEditDraft(null);
        toast.success('Message updated');
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <AdminPageHeader title="Contact" />
            </div>

            <AdminDataTable
                headers={['Date', 'Name', 'Email', 'Subject', 'Status', '']}
                loading={loading}
                emptyText="No messages yet."
                colSpan={6}
            >
                {paged.map((m) => (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => openMessage(m)}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        </TableCell>
                        <TableCell className={m.status === 'unread' ? 'font-semibold text-foreground' : 'text-foreground'}>
                            {m.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.email}</TableCell>
                        <TableCell className="text-muted-foreground">{m.subject ?? '—'}</TableCell>
                        <TableCell>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status]}`}>
                                {m.status}
                            </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">View →</TableCell>
                    </TableRow>
                ))}
            </AdminDataTable>
            {totalPages > 1 ? (
                <div className="mt-3 flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
            ) : null}

            <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                <DialogContent className="max-w-2xl">
                    {selected && (
                        <div className="flex flex-col gap-6 pb-8">
                            <DialogHeader>
                                <DialogTitle>Message from {selected.name}</DialogTitle>
                            </DialogHeader>

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
                                        <Button variant="outline" onClick={() => setEditDraft({ ...selected })}>
                                            Edit
                                        </Button>
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
                </DialogContent>
            </Dialog>
            <Dialog open={!!editDraft} onOpenChange={(open) => !open && setEditDraft(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Edit Message</DialogTitle></DialogHeader>
                    {editDraft ? (
                        <div className="space-y-3">
                            <div className="space-y-1"><Label>Name</Label><Input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Email</Label><Input value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Subject</Label><Input value={editDraft.subject ?? ''} onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })} /></div>
                            <div className="space-y-1"><Label>Message</Label><Textarea rows={8} value={editDraft.message} onChange={(e) => setEditDraft({ ...editDraft, message: e.target.value })} /></div>
                            <div className="flex gap-2">
                                <Button onClick={() => void saveEdit()}>Save</Button>
                                <Button variant="outline" onClick={() => setEditDraft(null)}>Cancel</Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
