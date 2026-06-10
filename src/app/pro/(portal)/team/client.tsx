'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type Role = 'owner' | 'admin' | 'member';

export type TeamMember = {
    id: string;
    role: Role;
    status: 'invited' | 'active' | 'removed';
    isYou: boolean;
    name: string;
    email: string | null;
};

const ROLE_LABEL: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
};

export default function TeamClient({ members, role }: { members: TeamMember[]; role: Role }) {
    const [rows, setRows] = useState<TeamMember[]>(members);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
    const [busyId, setBusyId] = useState<string | null>(null);

    const canManage = role === 'owner' || role === 'admin';

    const invite = async () => {
        if (saving || !email.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/pro/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), role: inviteRole }),
            });
            const json = (await res.json().catch(() => null)) as {
                member?: { id: string; status: string };
                linked?: boolean;
                error?: string;
            } | null;
            if (!res.ok || !json?.member) {
                toast.error(json?.error ?? 'Could not send invite.');
                return;
            }
            setRows((r) => [
                ...r,
                {
                    id: json.member!.id,
                    role: inviteRole,
                    status: (json.member!.status as TeamMember['status']) ?? 'invited',
                    isYou: false,
                    name: email.trim(),
                    email: email.trim(),
                },
            ]);
            setEmail('');
            setInviteRole('member');
            setOpen(false);
            toast.success(json.linked ? 'Teammate added.' : 'Invite sent.');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const changeRole = async (id: string, newRole: Role) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/pro/members/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Could not update role.');
                return;
            }
            setRows((r) => r.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (id: string) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/pro/members/${id}`, { method: 'DELETE' });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Could not remove teammate.');
                return;
            }
            setRows((r) => r.filter((m) => m.id !== id));
            toast.success('Teammate removed.');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold text-foreground">Team</h1>
                    <p className="text-sm text-muted-foreground">
                        Invite people to work leads and jobs with you.
                    </p>
                </div>
                {canManage ? (
                    <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
                        Invite
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-col">
                {rows.map((m, i) => (
                    <Fragment key={m.id}>
                        {i > 0 && <Separator />}
                        <div className="flex items-center gap-3 py-3">
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <p className="truncate text-sm font-medium text-foreground">
                                    {m.name}
                                    {m.isYou ? ' (You)' : ''}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {ROLE_LABEL[m.role]}
                                    {m.status === 'invited' ? ' · Invited' : ''}
                                </p>
                            </div>
                            {role === 'owner' && m.role !== 'owner' ? (
                                <Select
                                    value={m.role}
                                    onValueChange={(v) => void changeRole(m.id, v as Role)}
                                    disabled={busyId === m.id}
                                >
                                    <SelectTrigger className="h-8 w-28 shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="member">Member</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : null}
                            {canManage && m.role !== 'owner' && !m.isYou ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={busyId === m.id}
                                    onClick={() => void remove(m.id)}
                                >
                                    Remove
                                </Button>
                            ) : null}
                        </div>
                    </Fragment>
                ))}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Invite Teammate</DialogTitle>
                        <DialogDescription>
                            They join your team the next time they sign in with this email.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="invite-role">Role</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={(v) => setInviteRole(v as 'member' | 'admin')}
                            >
                                <SelectTrigger id="invite-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="member">Member</SelectItem>
                                    {role === 'owner' ? (
                                        <SelectItem value="admin">Admin</SelectItem>
                                    ) : null}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            disabled={saving || !email.trim()}
                            onClick={() => void invite()}
                        >
                            {saving ? 'Sending…' : 'Send Invite'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
