'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export interface ReviewRow {
    id: string;
    rating: number | null;
    outcome: string | null;
    createdAt: string;
    contractorReply: string | null;
    contractorReplyAt: string | null;
}

interface ReviewsClientProps {
    reviews: ReviewRow[];
}

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_REPLY_LEN = 5;
const MAX_REPLY_LEN = 1000;

function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function isEditWindowOpen(replyAt: string | null): boolean {
    if (!replyAt) return true; // first reply — always allowed
    const elapsed = Date.now() - new Date(replyAt).getTime();
    return Number.isFinite(elapsed) && elapsed <= EDIT_WINDOW_MS;
}

function StarRow({ rating }: { rating: number | null }) {
    const filled = rating != null ? Math.round(rating) : 0;
    return (
        <span aria-label={rating != null ? `${rating}/5 stars` : 'No rating'} className="inline-flex">
            {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} aria-hidden="true" className={i < filled ? 'text-amber-500' : 'text-gray-300'}>
                    ★
                </span>
            ))}
        </span>
    );
}

function ReplyForm({
    review,
    onSaved,
    onCancel,
}: {
    review: ReviewRow;
    onSaved: (next: ReviewRow) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState<string>(review.contractorReply ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit() {
        const trimmed = text.trim();
        if (trimmed.length < MIN_REPLY_LEN || trimmed.length > MAX_REPLY_LEN) {
            setError(`Reply must be between ${MIN_REPLY_LEN} and ${MAX_REPLY_LEN} characters.`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/contractors/reviews/${review.id}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reply: trimmed }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                contractor_reply?: string;
                contractor_reply_at?: string;
            };
            if (!res.ok || !json.ok) {
                setError(json.error ?? 'Failed to save reply.');
                setBusy(false);
                return;
            }
            onSaved({
                ...review,
                contractorReply: json.contractor_reply ?? trimmed,
                contractorReplyAt: json.contractor_reply_at ?? new Date().toISOString(),
            });
        } catch {
            setError('Network error. Please try again.');
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={MAX_REPLY_LEN}
                className="w-full rounded-lg border border-input bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                placeholder="Thanks for the feedback…"
                disabled={busy}
            />
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                    {text.trim().length}/{MAX_REPLY_LEN}
                </span>
                <span className="text-xs text-muted-foreground">
                    This reply is visible on your public profile.
                </span>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
                <Button onClick={submit} disabled={busy} size="sm">
                    {busy ? 'Saving…' : 'Submit reply'}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={busy} size="sm">
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function ReviewCard({ initial }: { initial: ReviewRow }) {
    const [review, setReview] = useState<ReviewRow>(initial);
    const [editing, setEditing] = useState(false);
    const canEdit = isEditWindowOpen(review.contractorReplyAt);

    return (
        <li className="flex flex-col gap-3 border-t border-input py-4 first:border-t-0 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <StarRow rating={review.rating} />
                    {review.rating != null ? (
                        <span className="text-sm font-medium text-foreground">
                            {review.rating}/5
                        </span>
                    ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                </span>
            </div>
            {review.outcome ? (
                <p className="text-sm text-foreground">{review.outcome}</p>
            ) : (
                <p className="text-sm italic text-muted-foreground">
                    Verified outcome — no written feedback.
                </p>
            )}

            {!editing && review.contractorReply ? (
                <div className="ml-4 rounded-lg border border-input bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-foreground">
                        Your reply
                        {review.contractorReplyAt
                            ? ` · ${formatDate(review.contractorReplyAt)}`
                            : null}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{review.contractorReply}</p>
                </div>
            ) : null}

            {editing ? (
                <ReplyForm
                    review={review}
                    onSaved={(next) => {
                        setReview(next);
                        setEditing(false);
                    }}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <div className="flex items-center gap-3">
                    {canEdit ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                            {review.contractorReply ? 'Edit reply' : 'Reply'}
                        </Button>
                    ) : (
                        <span
                            className="text-xs text-muted-foreground"
                            title="Replies can be edited only within 24 hours of being posted."
                        >
                            Reply window closed
                        </span>
                    )}
                </div>
            )}
        </li>
    );
}

export default function ReviewsClient({ reviews }: ReviewsClientProps) {
    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <Link
                        href="/contractors/account"
                        className="text-sm text-gray-600 hover:underline"
                    >
                        ← Back to dashboard
                    </Link>
                    <h1 className="text-2xl font-semibold text-foreground">Reviews</h1>
                    <p className="text-sm text-muted-foreground">
                        Homeowner ratings from completed Mendr jobs. Replies appear publicly
                        on your contractor profile.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Your most recent reviews</CardTitle>
                        <CardDescription>
                            Up to the last 20 outcomes. You can reply once, and edit your reply
                            within 24 hours.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {reviews.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No reviews yet. Reviews appear here as homeowners rate completed
                                jobs.
                            </p>
                        ) : (
                            <ul className="flex flex-col">
                                {reviews.map((r) => (
                                    <ReviewCard key={r.id} initial={r} />
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
