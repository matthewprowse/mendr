'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const CATEGORIES = [
    { key: 'punctuality', label: 'Punctuality', hint: 'Did they arrive on time and communicate any delays?' },
    { key: 'professionalism', label: 'Professionalism', hint: 'How they interacted with you and explained the work.' },
    { key: 'cleanliness', label: 'Cleanliness', hint: 'How well they protected your home and cleaned up.' },
    { key: 'quote_accuracy', label: 'Quote accuracy', hint: 'How close the final price was to the original quote.' },
] as const;

export function ProReviewForm({ providerId }: { providerId: string }) {
    const [body, setBody] = useState('');
    const [reviewerName, setReviewerName] = useState('');
    const [ratings, setRatings] = useState<Record<string, number>>({});
    const [imagePaths, setImagePaths] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const setRating = (key: string, value: number) => {
        setRatings((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!body.trim()) {
            toast.error('Please write your review.');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/providers/${providerId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    body: body.trim(),
                    reviewer_name: reviewerName.trim() || undefined,
                    category_ratings: Object.keys(ratings).length > 0 ? ratings : undefined,
                    image_urls: imagePaths.length > 0 ? imagePaths : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to submit');
            toast.success('Thank you! Your review has been submitted.');
            setBody('');
            setReviewerName('');
            setRatings({});
            setImagePaths([]);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to submit review');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="reviewer_name">Your name (optional)</Label>
                <Input
                    id="reviewer_name"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. John"
                    className="max-w-xs"
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
                <p className="text-sm font-medium">Rate by Category (Optional)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {CATEGORIES.map(({ key, label, hint }) => (
                        <div key={key} className="space-y-1">
                            <Label className="text-xs">{label}</Label>
                            <p className="text-[11px] text-muted-foreground">{hint}</p>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => {
                                    const active = ratings[key] >= n;
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
