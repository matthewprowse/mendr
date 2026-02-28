'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Cross } from '@/lib/icons';
import { AuthPromptDialog } from '@/components/auth-prompt-dialog';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

interface WriteReviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    providerName: string;
    placeId?: string | null;
    providerProfileSlug?: string | null;
}

type SubmitStep = 'form' | 'submitting' | 'success' | 'error';

const MAX_IMAGES = 4;
const MAX_SIZE_MB = 8;

const CATEGORIES: { key: string; label: string; placeholder: string }[] = [
    { key: 'punctuality', label: 'Punctuality', placeholder: 'Did they arrive on time?' },
    { key: 'tidiness', label: 'Cleanliness', placeholder: 'Did they leave things tidy?' },
    { key: 'professionalism', label: 'Professionalism', placeholder: 'Were they professional throughout?' },
    { key: 'quote_accuracy', label: 'Quote Accuracy', placeholder: 'Was the final price close to the quote?' },
];

function StarSelector({
    value,
    onChange,
    disabled,
}: {
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
}) {
    const [hovered, setHovered] = useState(0);
    const display = hovered || value;
    return (
        <div className="flex items-center gap-0.5" role="radiogroup">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={value === star}
                    aria-label={`${star} star${star !== 1 ? 's' : ''}`}
                    className={`text-xl leading-none transition-colors ${
                        display >= star ? 'text-yellow-500' : 'text-muted-foreground/25'
                    } ${disabled ? 'pointer-events-none' : ''}`}
                    onMouseEnter={() => !disabled && setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => !disabled && onChange(star)}
                >
                    ★
                </button>
            ))}
        </div>
    );
}

export function WriteReviewDialog({
    open,
    onOpenChange,
    providerName,
    placeId,
    providerProfileSlug,
}: WriteReviewDialogProps) {
    const { user } = useAuth();

    const [authPromptOpen, setAuthPromptOpen] = useState(false);

    // Overall rating
    const [rating, setRating] = useState(0);

    // Per-category ratings: key → 0 (unset) | 1–5
    const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>(() =>
        Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]))
    );

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [reviewerName, setReviewerName] = useState('');
    const [reviewerEmail, setReviewerEmail] = useState('');
    const [images, setImages] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);

    const [step, setStep] = useState<SubmitStep>('form');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && !user) {
            setAuthPromptOpen(true);
        }
    }, [open, user]);

    const resetForm = () => {
        setRating(0);
        setCategoryRatings(Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])));
        setTitle('');
        setBody('');
        setReviewerName('');
        setReviewerEmail('');
        setImages([]);
        setImagePreviews([]);
        setStep('form');
        setErrorMsg(null);
    };

    const handleClose = (v: boolean) => {
        if (!v) resetForm();
        onOpenChange(v);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        const filtered = files.filter((f) => f.size <= MAX_SIZE_MB * 1024 * 1024);
        const combined = [...images, ...filtered].slice(0, MAX_IMAGES);
        setImages(combined);
        setImagePreviews(combined.map((f) => URL.createObjectURL(f)));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeImage = (idx: number) => {
        const next = images.filter((_, i) => i !== idx);
        setImages(next);
        setImagePreviews(next.map((f) => URL.createObjectURL(f)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;
        if (!body.trim()) return;

        setStep('submitting');
        setErrorMsg(null);

        try {
            const uploadedUrls: string[] = [];
            for (const file of images) {
                const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
                const folder = placeId
                    ? `place/${placeId.replace(/[^a-zA-Z0-9-_]/g, '_')}`
                    : providerProfileSlug
                    ? `profile/${providerProfileSlug}`
                    : 'misc';
                const storagePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

                const { error: upErr } = await supabase.storage
                    .from('reviews')
                    .upload(storagePath, file, { contentType: file.type, upsert: false });
                if (upErr) throw upErr;

                const { data: { publicUrl } } = supabase.storage
                    .from('reviews')
                    .getPublicUrl(storagePath);
                uploadedUrls.push(publicUrl);
            }

            // Only include category ratings the user actually set (> 0)
            const categoryRatingsFiltered = Object.fromEntries(
                Object.entries(categoryRatings).filter(([, v]) => v > 0)
            );

            const payload = {
                place_id: placeId ?? null,
                provider_profile_slug: providerProfileSlug ?? null,
                user_id: user?.id ?? null,
                reviewer_name: reviewerName.trim() || (user?.email ?? 'Anonymous'),
                reviewer_email: reviewerEmail.trim() || user?.email || null,
                rating,
                category_ratings: categoryRatingsFiltered,
                title: title.trim() || null,
                body: body.trim(),
                image_urls: uploadedUrls,
            };

            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? 'Failed to submit review.');
            }

            setStep('success');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
            setStep('error');
        }
    };

    const isFormOpen = open && !!user;

    return (
        <>
            <AuthPromptDialog
                open={authPromptOpen}
                onOpenChange={(v) => {
                    setAuthPromptOpen(v);
                    if (!v) onOpenChange(false);
                }}
                reason={`Sign in to leave a review for ${providerName}.`}
            />

            <Dialog open={isFormOpen} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                    {step === 'success' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Review submitted</DialogTitle>
                                <DialogDescription>
                                    Thank you for your review of{' '}
                                    <span className="font-medium text-foreground">{providerName}</span>. We
                                    verify all reviews before publishing — yours will appear once approved.
                                </DialogDescription>
                            </DialogHeader>
                            <Button className="w-full" onClick={() => handleClose(false)}>
                                Done
                            </Button>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Write a review</DialogTitle>
                                <DialogDescription>
                                    Share your experience with{' '}
                                    <span className="font-medium text-foreground">{providerName}</span>.
                                    Reviews are verified before they go live.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                                {/* Overall rating */}
                                <div className="space-y-1.5">
                                    <Label>Overall rating <span className="text-destructive">*</span></Label>
                                    <StarSelector
                                        value={rating}
                                        onChange={setRating}
                                        disabled={step === 'submitting'}
                                    />
                                </div>

                                {/* Per-category ratings */}
                                <div className="space-y-3">
                                    <Label>Rate by category</Label>
                                    <div className="rounded-lg border border-border divide-y divide-border">
                                        {CATEGORIES.map((cat) => (
                                            <div
                                                key={cat.key}
                                                className="flex items-center justify-between px-3 py-2.5 gap-4"
                                            >
                                                <span className="text-sm text-foreground">{cat.label}</span>
                                                <StarSelector
                                                    value={categoryRatings[cat.key]}
                                                    onChange={(v) =>
                                                        setCategoryRatings((prev) => ({
                                                            ...prev,
                                                            [cat.key]: v,
                                                        }))
                                                    }
                                                    disabled={step === 'submitting'}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Reviewer name */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="review-name">Your name <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="review-name"
                                        placeholder="e.g. Sarah M."
                                        value={reviewerName}
                                        onChange={(e) => setReviewerName(e.target.value)}
                                        required
                                        disabled={step === 'submitting'}
                                    />
                                </div>

                                {/* Email (only when not logged in with email) */}
                                {!user?.email && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="review-email">Email address</Label>
                                        <Input
                                            id="review-email"
                                            type="email"
                                            placeholder="you@example.com"
                                            value={reviewerEmail}
                                            onChange={(e) => setReviewerEmail(e.target.value)}
                                            disabled={step === 'submitting'}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Optional — only used if we need to follow up.
                                        </p>
                                    </div>
                                )}

                                {/* Title */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="review-title">Title</Label>
                                    <Input
                                        id="review-title"
                                        placeholder="Summarise your experience in a few words"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={120}
                                        disabled={step === 'submitting'}
                                    />
                                </div>

                                {/* Review body */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="review-body">
                                        Your review <span className="text-destructive">*</span>
                                    </Label>
                                    <Textarea
                                        id="review-body"
                                        placeholder="Tell others about the quality of work, punctuality, pricing, and overall experience…"
                                        rows={4}
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        required
                                        minLength={20}
                                        disabled={step === 'submitting'}
                                    />
                                    <p className="text-xs text-muted-foreground">Minimum 20 characters.</p>
                                </div>

                                {/* Photo upload */}
                                <div className="space-y-1.5">
                                    <Label>
                                        Photos{' '}
                                        <span className="font-normal text-muted-foreground">
                                            (optional, up to {MAX_IMAGES})
                                        </span>
                                    </Label>
                                    {imagePreviews.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {imagePreviews.map((src, idx) => (
                                                <div
                                                    key={idx}
                                                    className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                                                >
                                                    <a
                                                        href={src}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block h-full w-full"
                                                        tabIndex={-1}
                                                    >
                                                        <Image
                                                            src={src}
                                                            alt={`Preview ${idx + 1}`}
                                                            fill
                                                            className="object-cover"
                                                            sizes="80px"
                                                            unoptimized
                                                        />
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(idx)}
                                                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground hover:bg-background"
                                                        aria-label="Remove image"
                                                    >
                                                        <Cross className="size-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {images.length < MAX_IMAGES && (
                                        <>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="sr-only"
                                                id="review-images"
                                                onChange={handleImageSelect}
                                                disabled={step === 'submitting'}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={step === 'submitting'}
                                            >
                                                Add photos
                                            </Button>
                                        </>
                                    )}
                                    <p className="text-xs text-muted-foreground">Max {MAX_SIZE_MB} MB per photo.</p>
                                </div>

                                {step === 'error' && errorMsg && (
                                    <p className="text-sm text-destructive">{errorMsg}</p>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => handleClose(false)}
                                        disabled={step === 'submitting'}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        disabled={
                                            step === 'submitting' ||
                                            rating === 0 ||
                                            !body.trim() ||
                                            !reviewerName.trim()
                                        }
                                    >
                                        {step === 'submitting' ? 'Submitting…' : 'Submit Review'}
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
