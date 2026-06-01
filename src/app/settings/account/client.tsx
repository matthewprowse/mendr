'use client';

/**
 * AccountClient — Settings sub-page for profile, password, and account deletion.
 *
 * Sections (single narrow column on mobile and desktop):
 * 1. Profile — first name, surname, email (readonly), description (200 chars).
 * 2. Password — current + new + confirm, posts to /api/account/password.
 * 3. Sign Out — clears the session and routes back to /home.
 * 4. Delete Account — destructive; requires the user to retype their email in
 *    an AlertDialog before calling /api/account/delete.
 *
 * Logged-out users get bounced to /auth/login?next=/settings/account.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { getSupabase } from '@/lib/auth/supabase';
import { UserAvatar } from '@/components/user-avatar';
import { toast } from 'sonner';

export type Profile = {
    email: string | null;
    firstName: string;
    surname: string;
    description: string;
    avatarUrl: string | null;
};

export default function AccountClient({ initialProfile }: { initialProfile?: Profile }) {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [profile, setProfile] = useState<Profile | null>(initialProfile ?? null);
    const [firstName, setFirstName] = useState(initialProfile?.firstName ?? '');
    const [surname, setSurname] = useState(initialProfile?.surname ?? '');
    const [description, setDescription] = useState(initialProfile?.description ?? '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    const [confirmEmail, setConfirmEmail] = useState('');
    const [deleting, setDeleting] = useState(false);

    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [removingAvatar, setRemovingAvatar] = useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialProfile !== undefined) return; // server already provided data
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch('/api/account/profile')
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((data: Profile) => {
                if (cancelled) return;
                setProfile(data);
                setFirstName(data.firstName ?? '');
                setSurname(data.surname ?? '');
                setDescription(data.description ?? '');
            })
            .catch(() => {
                if (!cancelled) setLoadError('We could not load your profile.');
            });
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const dirty =
        profile != null &&
        (firstName.trim() !== profile.firstName ||
            surname.trim() !== profile.surname ||
            description.trim() !== profile.description);

    const handleSaveProfile = useCallback(async () => {
        if (!dirty || savingProfile) return;
        setSavingProfile(true);
        try {
            const res = await fetch('/api/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: firstName.trim(),
                    surname: surname.trim(),
                    description: description.trim(),
                }),
            });
            if (!res.ok) throw new Error(String(res.status));
            const data = (await res.json()) as { ok: boolean };
            if (!data.ok) throw new Error('Save failed.');
            toast.success('Profile updated.');
            setProfile((p) =>
                p
                    ? {
                          ...p,
                          firstName: firstName.trim(),
                          surname: surname.trim(),
                          description: description.trim(),
                      }
                    : p
            );
        } catch {
            toast.error('Could not save changes.');
        } finally {
            setSavingProfile(false);
        }
    }, [dirty, savingProfile, firstName, surname, description]);

    const handleChangePassword = useCallback(async () => {
        if (savingPassword) return;
        if (!currentPassword) {
            toast.error('Enter your current password.');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match.');
            return;
        }
        setSavingPassword(true);
        try {
            const res = await fetch('/api/account/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
            };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Could not change password.');
            }
            toast.success('Password updated.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not change password.');
        } finally {
            setSavingPassword(false);
        }
    }, [savingPassword, currentPassword, newPassword, confirmPassword]);

    const handleSignOut = useCallback(async () => {
        await signOut();
        router.push('/home');
    }, [router, signOut]);

    const handleDelete = useCallback(async () => {
        if (deleting) return;
        if (!profile?.email) return;
        setDeleting(true);
        try {
            const res = await fetch('/api/account/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmEmail: confirmEmail.trim().toLowerCase() }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
            };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Could not delete account.');
            }
            toast.success('Your account has been deleted.');
            await signOut();
            router.push('/');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete account.');
            setDeleting(false);
        }
    }, [deleting, profile, confirmEmail, router, signOut]);

    const handleAvatarChange = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Reset so the same file can be re-selected if the user tries again.
            e.target.value = '';

            // Show an optimistic local preview immediately while the upload runs.
            const objectUrl = URL.createObjectURL(file);
            setAvatarPreviewUrl(objectUrl);
            setUploadingAvatar(true);

            try {
                const body = new FormData();
                body.append('file', file);

                const res = await fetch('/api/account/avatar', {
                    method: 'POST',
                    body,
                });
                const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    avatarUrl?: string;
                    error?: string;
                };
                if (!res.ok || !data.ok) {
                    throw new Error(data.error ?? 'Upload failed.');
                }

                // Swap the blob preview for the permanent server URL.
                setProfile((p) =>
                    p ? { ...p, avatarUrl: data.avatarUrl ?? null } : p
                );
                URL.revokeObjectURL(objectUrl);
                setAvatarPreviewUrl(null);

                // Refresh the auth session so UserAvatar in the top bar picks up
                // the new avatar_url from user_metadata without a page reload.
                await getSupabase().auth.refreshSession();

                toast.success('Profile photo updated.');
            } catch (err) {
                toast.error(
                    err instanceof Error ? err.message : 'Could not upload photo.'
                );
                URL.revokeObjectURL(objectUrl);
                setAvatarPreviewUrl(null);
            } finally {
                setUploadingAvatar(false);
            }
        },
        [],
    );

    const handleRemoveAvatar = useCallback(async () => {
        if (removingAvatar || uploadingAvatar) return;
        setRemovingAvatar(true);
        try {
            const res = await fetch('/api/account/avatar', { method: 'DELETE' });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
            };
            if (!res.ok || !data.ok) {
                throw new Error(data.error ?? 'Could not remove photo.');
            }
            setProfile((p) => (p ? { ...p, avatarUrl: null } : p));
            setAvatarPreviewUrl(null);
            await getSupabase().auth.refreshSession();
            toast.success('Profile photo removed.');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not remove photo.');
        } finally {
            setRemovingAvatar(false);
        }
    }, [removingAvatar, uploadingAvatar]);

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => router.back()}
                >
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Account
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to manage your account.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/account">
                                            Log In
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isLoading = profile === null && !loadError;
    const canChangePassword =
        currentPassword.length > 0 &&
        newPassword.length >= 8 &&
        newPassword === confirmPassword;
    const canDelete =
        profile?.email != null &&
        confirmEmail.trim().toLowerCase() === profile.email.toLowerCase();

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Account
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {isLoading ? (
                                    /*
                                     * SKELETON — mirrors the full account form rendered below
                                     * when profile loads:
                                     *   Profile section: avatar circle + Change Photo button ·
                                     *   2-col name grid · email · description textarea · Save
                                     *   button.
                                     *   Separator.
                                     *   Password section: current · new (+ hint) · confirm ·
                                     *   Change Password button.
                                     *   Separator.
                                     *   Log Out · Delete Account buttons.
                                     * ⚠️ If you add, remove, or resize any field or section in
                                     * the form below, update this skeleton to match so there is
                                     * no layout shift when data arrives.
                                     */
                                    <div className="flex flex-col gap-6">
                                        {/* Profile section */}
                                        <div className="flex flex-col gap-6">
                                            {/* Avatar — photo left, button right */}
                                            <div className="flex items-center gap-4">
                                                <Skeleton className="size-16 shrink-0 rounded-full" />
                                                <Skeleton className="h-8 w-28 rounded-md" />
                                            </div>
                                            {/* First Name + Surname */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="flex flex-col gap-3">
                                                    <Skeleton className="h-3.5 w-1/4 rounded" />
                                                    <Skeleton className="h-10 w-full rounded-md" />
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <Skeleton className="h-3.5 w-1/4 rounded" />
                                                    <Skeleton className="h-10 w-full rounded-md" />
                                                </div>
                                            </div>
                                            {/* Email */}
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                                <Skeleton className="h-3 w-3/5 rounded" />
                                            </div>
                                            {/* Description textarea */}
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <Skeleton className="h-3.5 w-1/4 rounded" />
                                                    <Skeleton className="h-3 w-10 rounded" />
                                                </div>
                                                <Skeleton className="h-20 w-full rounded-md" />
                                                <Skeleton className="h-3 w-3/5 rounded" />
                                            </div>
                                            {/* Save Changes button */}
                                            <Skeleton className="h-10 w-full rounded-md" />
                                        </div>

                                        <Separator />

                                        {/* Password section */}
                                        <div className="flex flex-col gap-6">
                                            {/* Current Password */}
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                            </div>
                                            {/* New Password */}
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                                <Skeleton className="h-3 w-3/5 rounded" />
                                            </div>
                                            {/* Confirm New Password */}
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                            </div>
                                            {/* Change Password button */}
                                            <Skeleton className="h-10 w-full rounded-md" />
                                        </div>

                                        <Separator />

                                        {/* Sign out + delete buttons */}
                                        <div className="flex flex-col gap-2">
                                            <Skeleton className="h-10 w-full rounded-md" />
                                            <Skeleton className="h-10 w-full rounded-md" />
                                        </div>
                                    </div>
                                ) : null}

                                {loadError ? (
                                    <p className="text-center text-sm text-destructive">
                                        {loadError}
                                    </p>
                                ) : null}

                                {profile ? (
                                    <>
                                        {/* Profile section */}
                                        <div className="flex flex-col gap-6">
                                            {/* Profile photo — avatar left, label + actions right */}
                                            <div className="flex items-center gap-4">
                                                {/* Avatar */}
                                                <div className="relative shrink-0">
                                                    <Avatar className="size-16">
                                                        {(avatarPreviewUrl ?? profile.avatarUrl) ? (
                                                            <AvatarImage
                                                                src={avatarPreviewUrl ?? profile.avatarUrl ?? ''}
                                                                alt={firstName || 'Profile photo'}
                                                            />
                                                        ) : null}
                                                        <AvatarFallback className="text-lg">
                                                            {firstName && surname
                                                                ? `${firstName[0]}${surname[0]}`.toUpperCase()
                                                                : firstName
                                                                  ? firstName[0].toUpperCase()
                                                                  : profile.email
                                                                    ? profile.email[0].toUpperCase()
                                                                    : ''}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    {(uploadingAvatar || removingAvatar) ? (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                                                            <Spinner className="size-4 text-white" />
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex flex-col gap-2 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            disabled={uploadingAvatar || removingAvatar}
                                                            onClick={() => avatarInputRef.current?.click()}
                                                        >
                                                            {uploadingAvatar
                                                                ? 'Uploading…'
                                                                : profile.avatarUrl
                                                                  ? 'Replace Photo'
                                                                  : 'Add Photo'}
                                                        </Button>
                                                        {profile.avatarUrl && !uploadingAvatar && !removingAvatar ? (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-muted-foreground"
                                                                onClick={() => void handleRemoveAvatar()}
                                                            >
                                                                {removingAvatar ? 'Removing…' : 'Remove'}
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <input
                                                    ref={avatarInputRef}
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    className="sr-only"
                                                    aria-hidden="true"
                                                    tabIndex={-1}
                                                    onChange={(e) => void handleAvatarChange(e)}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="flex flex-col gap-3">
                                                    <Label htmlFor="first-name">
                                                        First Name
                                                    </Label>
                                                    <Input
                                                        id="first-name"
                                                        value={firstName}
                                                        onChange={(e) =>
                                                            setFirstName(e.target.value)
                                                        }
                                                        autoComplete="given-name"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <Label htmlFor="surname">Surname</Label>
                                                    <Input
                                                        id="surname"
                                                        value={surname}
                                                        onChange={(e) =>
                                                            setSurname(e.target.value)
                                                        }
                                                        autoComplete="family-name"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="email">Email Address</Label>
                                                <Input
                                                    id="email"
                                                    value={profile.email ?? ''}
                                                    readOnly
                                                    disabled
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                </p>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="description">
                                                        Description
                                                    </Label>
                                                    <span className="text-xs text-muted-foreground">
                                                        {description.length} / 200
                                                    </span>
                                                </div>
                                                <Textarea
                                                    id="description"
                                                    value={description}
                                                    onChange={(e) =>
                                                        setDescription(e.target.value)
                                                    }
                                                    maxLength={200}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                </p>
                                            </div>

                                            <Button
                                                type="button"
                                                className="w-full"
                                                disabled={!dirty || savingProfile}
                                                onClick={() => void handleSaveProfile()}
                                            >
                                                {savingProfile ? 'Saving…' : 'Save Changes'}
                                            </Button>
                                        </div>

                                        <Separator />

                                        {/* Password section */}
                                        <div className="flex flex-col gap-6">
                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="current-password">
                                                    Current Password
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        id="current-password"
                                                        type={
                                                            showCurrent ? 'text' : 'password'
                                                        }
                                                        value={currentPassword}
                                                        onChange={(e) =>
                                                            setCurrentPassword(e.target.value)
                                                        }
                                                        autoComplete="current-password"
                                                        className="pr-10"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setShowCurrent((s) => !s)
                                                        }
                                                        aria-label={
                                                            showCurrent
                                                                ? 'Hide password'
                                                                : 'Show password'
                                                        }
                                                        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showCurrent ? (
                                                            <EyeOff size={18} />
                                                        ) : (
                                                            <Eye size={18} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="new-password">
                                                    New Password
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        id="new-password"
                                                        type={showNew ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(e) =>
                                                            setNewPassword(e.target.value)
                                                        }
                                                        autoComplete="new-password"
                                                        className="pr-10"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNew((s) => !s)}
                                                        aria-label={
                                                            showNew
                                                                ? 'Hide password'
                                                                : 'Show password'
                                                        }
                                                        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showNew ? (
                                                            <EyeOff size={18} />
                                                        ) : (
                                                            <Eye size={18} />
                                                        )}
                                                    </button>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                </p>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="confirm-password">
                                                    Confirm New Password
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        id="confirm-password"
                                                        type={
                                                            showConfirm ? 'text' : 'password'
                                                        }
                                                        value={confirmPassword}
                                                        onChange={(e) =>
                                                            setConfirmPassword(e.target.value)
                                                        }
                                                        autoComplete="new-password"
                                                        className="pr-10"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setShowConfirm((s) => !s)
                                                        }
                                                        aria-label={
                                                            showConfirm
                                                                ? 'Hide password'
                                                                : 'Show password'
                                                        }
                                                        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showConfirm ? (
                                                            <EyeOff size={18} />
                                                        ) : (
                                                            <Eye size={18} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                className="w-full"
                                                disabled={
                                                    !canChangePassword || savingPassword
                                                }
                                                onClick={() => void handleChangePassword()}
                                            >
                                                {savingPassword
                                                    ? 'Updating…'
                                                    : 'Change Password'}
                                            </Button>
                                        </div>

                                        <Separator />

                                        {/* Sign out + delete */}
                                        <div className="flex flex-col gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="w-full"
                                                onClick={() => void handleSignOut()}
                                            >
                                                Log Out
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        className="w-full"
                                                    >
                                                        Delete Account
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>
                                                            Delete your account?
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This is permanent. Your profile,
                                                            saved addresses, favourites, and
                                                            diagnosis history will all be
                                                            deleted. Type your email below
                                                            to confirm.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <div className="flex flex-col gap-3">
                                                        <Label htmlFor="confirm-email">
                                                            Email Address
                                                        </Label>
                                                        <Input
                                                            id="confirm-email"
                                                            value={confirmEmail}
                                                            onChange={(e) =>
                                                                setConfirmEmail(
                                                                    e.target.value
                                                                )
                                                            }
                                                            placeholder={profile.email ?? ''}
                                                            autoComplete="off"
                                                        />
                                                    </div>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel
                                                            onClick={() => setConfirmEmail('')}
                                                        >
                                                            Cancel
                                                        </AlertDialogCancel>
                                                        <AlertDialogAction
                                                            disabled={!canDelete || deleting}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                void handleDelete();
                                                            }}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            {deleting
                                                                ? 'Deleting…'
                                                                : 'Delete Account'}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
