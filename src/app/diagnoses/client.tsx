'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ellipsis, Search, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { getSupabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';
import type { DiagnosisListRow as DiagnosisRow } from '@/types/diagnosis';

export type { DiagnosisListRow as DiagnosisRow } from '@/types/diagnosis';

const PAGE_TITLE = 'Diagnosis History';

function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays < 2) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} Days Ago`;
    return d.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function sortRows(rows: DiagnosisRow[]): DiagnosisRow[] {
    return [...rows].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export default function DiagnosesClient({ initialRows }: { initialRows?: DiagnosisRow[] }) {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [rows, setRows] = useState<DiagnosisRow[] | null>(
        initialRows ? sortRows(initialRows) : null
    );
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [pinningId, setPinningId] = useState<string | null>(null);

    const headingRef = useRef<HTMLHeadingElement>(null);
    const [headingVisible, setHeadingVisible] = useState(true);

    useEffect(() => {
        const el = headingRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setHeadingVisible(entry?.isIntersecting ?? true),
            { threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (initialRows !== undefined) return;
        if (!isLoggedIn) { setRows([]); return; }
        let cancelled = false;
        const load = async () => {
            try {
                const supabase = getSupabase();
                const { data, error: queryError } = await supabase
                    .from('diagnoses')
                    .select('id, title, diagnosis, customer_address, created_at, pinned')
                    .order('pinned', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (cancelled) return;
                if (queryError) { setError('We could not load your diagnoses.'); return; }
                setRows(sortRows((data ?? []) as DiagnosisRow[]));
            } catch {
                if (!cancelled) setError('We could not load your diagnoses.');
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDelete = useCallback(async () => {
        if (!confirmDeleteId || deleting) return;
        setDeleting(true);
        try {
            const supabase = getSupabase();
            const { error: deleteError } = await supabase
                .from('diagnoses')
                .delete()
                .eq('id', confirmDeleteId);
            if (deleteError) throw new Error(deleteError.message);
            setRows((prev) => prev ? prev.filter((r) => r.id !== confirmDeleteId) : prev);
            toast.success('Diagnosis deleted.');
        } catch {
            toast.error('Could not delete diagnosis.');
        } finally {
            setDeleting(false);
            setConfirmDeleteId(null);
        }
    }, [confirmDeleteId, deleting]);

    const handlePin = useCallback(async (id: string, currentlyPinned: boolean) => {
        if (pinningId) return;
        setPinningId(id);
        try {
            const supabase = getSupabase();
            const { error: pinError } = await supabase
                .from('diagnoses')
                .update({ pinned: !currentlyPinned })
                .eq('id', id);
            if (pinError) throw new Error(pinError.message);
            setRows((prev) => prev
                ? sortRows(prev.map((r) => r.id === id ? { ...r, pinned: !currentlyPinned } : r))
                : prev
            );
            toast.success(currentlyPinned ? 'Unpinned.' : 'Pinned.');
        } catch {
            toast.error('Could not update pin.');
        } finally {
            setPinningId(null);
        }
    }, [pinningId]);

    const handleShare = useCallback(async (id: string) => {
        const url = `${window.location.origin}/report/${id}`;
        if (navigator.share) {
            try {
                await navigator.share({ url, title: 'Diagnosis Report' });
            } catch {
                /* cancelled */
            }
        } else {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied to clipboard.');
        }
    }, []);

    const handleDownload = useCallback((id: string) => {
        window.open(`/report/${id}`, '_blank');
    }, []);

    const filtered = rows?.filter((r) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        const title = r.title ?? r.diagnosis?.diagnosis ?? '';
        const trade = r.diagnosis?.trade ?? '';
        return title.toLowerCase().includes(q) || trade.toLowerCase().includes(q);
    }) ?? null;

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
                    {headingVisible ? BRAND_NAME : PAGE_TITLE}
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
                                            {PAGE_TITLE}
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to see your past diagnoses on this device and any others.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/diagnoses">Log In</Link>
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

    const isLoading = rows === null;
    const isEmpty = !isLoading && !error && rows.length === 0;

    return (
        <>
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col p-4">
                                <div className="mx-auto flex w-full max-w-xl flex-col gap-8">

                                    {/* Page heading */}
                                    <div className="flex w-full flex-col gap-3">
                                        <h1
                                            ref={headingRef}
                                            className="text-2xl font-semibold text-foreground"
                                        >
                                            {PAGE_TITLE}
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                        </p>
                                    </div>

                                    {/* New Diagnosis + Search */}
                                    <div className="flex flex-col gap-4">
                                        <Button asChild variant="secondary" className="w-full">
                                            <Link href="/start">New Diagnosis</Link>
                                        </Button>
                                        <div className="relative">
                                            <Search
                                                size={16}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            />
                                            <Input
                                                placeholder="Search Diagnoses"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                className="pl-9"
                                            />
                                        </div>
                                    </div>

                                    {/* Loading skeleton */}
                                    {isLoading ? (
                                        <div className="flex flex-col">
                                            {[0, 1, 2].map((i) => (
                                                <Fragment key={i}>
                                                    {i > 0 && <Separator />}
                                                    <div className="flex items-center gap-3 py-3">
                                                        <Skeleton className="size-12 shrink-0 rounded-md" />
                                                        <div className="flex flex-1 flex-col gap-1 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <Skeleton className="h-3.5 flex-1 rounded" />
                                                                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-1">
                                                            <Skeleton className="h-3 w-12 rounded" />
                                                            <Skeleton className="size-8 rounded-md" />
                                                        </div>
                                                    </div>
                                                </Fragment>
                                            ))}
                                        </div>
                                    ) : null}

                                    {/* Error */}
                                    {error ? (
                                        <p className="text-center text-sm text-destructive">{error}</p>
                                    ) : null}

                                    {/* Empty */}
                                    {isEmpty ? (
                                        <p className="text-center text-sm text-muted-foreground">
                                            No diagnoses yet.
                                        </p>
                                    ) : null}

                                    {/* No search results */}
                                    {!isLoading && !error && filtered !== null && filtered.length === 0 && !isEmpty ? (
                                        <p className="text-center text-sm text-muted-foreground">
                                            No results for &ldquo;{query}&rdquo;.
                                        </p>
                                    ) : null}

                                    {/* Diagnosis list */}
                                    {filtered && filtered.length > 0 ? (
                                        <div className="flex flex-col">
                                            {filtered.map((row, index) => {
                                                const title =
                                                    row.title ||
                                                    row.diagnosis?.diagnosis?.trim() ||
                                                    'Untitled Diagnosis';
                                                const trade = row.diagnosis?.trade ?? null;
                                                const dateLabel = formatRelativeDate(row.created_at);
                                                const isPinned = Boolean(row.pinned);
                                                return (
                                                    <div key={row.id}>
                                                        {index > 0 && <Separator />}
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => router.push(`/report/${row.id}`)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    router.push(`/report/${row.id}`);
                                                                }
                                                            }}
                                                            className="flex cursor-pointer items-center gap-3 py-3"
                                                        >
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                size="icon"
                                                                className="size-12 shrink-0"
                                                                tabIndex={-1}
                                                                aria-hidden="true"
                                                            />
                                                            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <p className="line-clamp-1 flex-1 text-sm font-medium min-w-0">
                                                                        {title}
                                                                    </p>
                                                                    {trade ? (
                                                                        <Badge variant="secondary" className="shrink-0 text-xs">
                                                                            {trade}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            <div
                                                                className="flex shrink-0 items-center gap-3"
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                            >
                                                                <span className="text-xs text-muted-foreground">
                                                                    {dateLabel}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className={`size-8 ${isPinned ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-foreground'}`}
                                                                    aria-label={isPinned ? 'Unstar diagnosis' : 'Star diagnosis'}
                                                                    disabled={pinningId === row.id}
                                                                    onClick={() => void handlePin(row.id, isPinned)}
                                                                >
                                                                    {pinningId === row.id
                                                                        ? <Spinner className="size-4 text-muted-foreground" />
                                                                        : <Star size={16} fill={isPinned ? 'currentColor' : 'none'} />
                                                                    }
                                                                </Button>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="size-8 text-muted-foreground hover:text-foreground"
                                                                            aria-label="More options"
                                                                        >
                                                                            <Ellipsis size={16} />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => router.push(`/report/${row.id}`)}>
                                                                            View Report
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => handleDownload(row.id)}>
                                                                            Download
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => void handleShare(row.id)}>
                                                                            Share
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => setConfirmDeleteId(row.id)}>
                                                                            Delete
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete confirmation */}
            <AlertDialog
                open={confirmDeleteId !== null}
                onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this diagnosis?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This is permanent. The diagnosis and its report will be removed from your history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => { e.preventDefault(); void handleDelete(); }}
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
