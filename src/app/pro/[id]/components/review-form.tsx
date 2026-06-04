'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const CATEGORY_KEYS = ['punctuality', 'cleanliness', 'work_quality', 'quote_accuracy'] as const;

const CATEGORIES = [
    { key: 'punctuality' as const, label: 'Punctuality', hint: 'Did they arrive on time and communicate any delays?' },
    { key: 'cleanliness' as const, label: 'Cleanliness', hint: 'How well they protected your home and cleaned up.' },
    { key: 'work_quality' as const, label: 'Work quality', hint: 'Quality of workmanship and how they explained the work.' },
    { key: 'quote_accuracy' as const, label: 'Quote accuracy', hint: 'How close the final price was to the original quote.' },
];

export function ProReviewForm({ providerId }: { providerId: string }) {
    const [body, setBody] = useState('');
    const [reviewerName, setReviewerName] = useState('');
    const [ratings, setRatings] = useState<Partial<Record<(typeof CATEGORY_KEYS)[number], number>>>({});
    const [loading, setLoading] = useState(false);

    const setRating = (key: (typeof CATEGORY_KEYS)[number], value: number) => {
        setRatings((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const name = reviewerName.trim();
        if (!name) {
            toast.error('Please enter your name.');
            return;
        }
        if (!body.trim()) {
            toast.error('Please write your review.');
            return;
        }
        const missingCategory = CATEGORY_KEYS.some((k) => {
            const v = ratings[k];
            return typeof v !== 'number' || v < 1 || v > 5;
        });
        if (missingCategory) {
            toast.error('Please rate all categories.');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId,
                    reviewerName: name,
                    reviewBody: body.trim(),
                    categoryRatings: {
                        punctuality: ratings.punctuality!,
                        cleanliness: ratings.cleanliness!,
                        work_quality: ratings.work_quality!,
                        quote_accuracy: ratings.quote_accuracy!,
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to submit');
            toast.success('Thank you! Your review has been submitted.');
            setBody('');
            setReviewerName('');
            setRatings({});
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to submit review');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="reviewer_name">Your name *</Label>
                <Input
                    id="reviewer_name"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. John"
                    className="max-w-xs"
                    required
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="body">Your review *</Label>
                <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Tell others about your experience..."
                    rows={4}
                    required
                />
            </div>
            <div className="space-y-3">
                <p className="text-sm font-medium">Rate by category *</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {CATEGORIES.map(({ key, label, hint }) => (
                        <div key={key} className="space-y-1">
                            <Label className="text-xs">{label}</Label>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => {
                                    const active = (ratings[key] ?? 0) >= n;
                                    return (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setRating(key, n)}
                                            className={`h-7 w-7 rounded border text-xs transition-colors flex items-center justify-center ${
                                                active
                                                    ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                                                    : 'border-border text-muted-foreground hover:bg-muted'
                                            }`}
                                            aria-label={`${n} star${n === 1 ? '' : 's'} for ${label}`}
                                        >
                                            ★
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <Button type="submit" disabled={loading}>
                {loading ? 'Submitting…' : 'Submit review'}
            </Button>
        </form>
    );
}
