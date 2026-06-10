'use client';
/* eslint-disable no-console */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/auth/supabase';
import { sanitizeAiContent } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Loader } from 'lucide-react';
import { compressImage } from '@/lib/image-compression';
import { UnrelatedImageCard } from './unrelated-image-card';
import { UnservicedCategoryCard } from './unserviced-category-card';
import {
    reportThoughtsParagraph,
    splitDetailAndHazard,
} from '@/lib/diagnosis/diagnosis-display';
import type { DiagnosisData } from '@/features/diagnosis/types';

const TRADE_JOB_TITLES: Record<string, string> = {
    Electrical: 'Electrician',
    Plumbing: 'Plumber',
    Security: 'Security Technician',
    'Building & Construction': 'Builder',
    'Carpentry & Woodwork': 'Carpenter',
    'Flooring & Tiling': 'Flooring Specialist',
    'Garden & Landscaping': 'Landscaper',
    'General Handyman': 'Handyman',
    'Locksmith Services': 'Locksmith',
    Painting: 'Painter',
    'Pool Maintenance': 'Pool Technician',
    'Rubble & Waste Removal': 'Waste Removal Team',
    Welding: 'Welder',
};

function tradeToJobTitle(trade: string | null): string {
    if (!trade) return 'Contractor';
    return TRADE_JOB_TITLES[trade] ?? 'Contractor';
}
import { getCostEstimate } from '@/lib/diagnosis/cost-estimates';
import type { ReportDetailServerResult } from '@/lib/diagnosis/fetch-report-detail-server';

type ReportData = {
    diagnosis: Record<string, unknown> | null;
    image_url: string | null;
    /** Ordered list of image URLs. Equals [image_url] for older rows that pre-date the multi-image migration. */
    imageUrls: string[];
    customer_address: string | null;
    customer_lat: number | null;
    customer_lng: number | null;
    initial_image_description: string | null;
};

export interface ReportDetailContentProps {
    reportId: string;
    /** When present, hydrates from the server fetch and skips redundant client loading when possible. */
    serverResult?: ReportDetailServerResult;
}

function initialFromServer(serverResult: ReportDetailServerResult | undefined): {
    loading: boolean;
    reportData: ReportData | null;
    error: string | null;
    skipClientFetch: boolean;
} {
    if (!serverResult || serverResult.status === 'skipped') {
        return { loading: true, reportData: null, error: null, skipClientFetch: false };
    }
    if (serverResult.status === 'ok') {
        return {
            loading: false,
            reportData: serverResult.data,
            error: null,
            skipClientFetch: true,
        };
    }
    if (serverResult.status === 'not_found') {
        return {
            loading: false,
            reportData: null,
            error: 'Report not found.',
            skipClientFetch: true,
        };
    }
    return {
        loading: false,
        reportData: null,
        error: serverResult.message,
        skipClientFetch: true,
    };
}

export function ReportDetailContent({ reportId, serverResult }: ReportDetailContentProps) {
    const id = reportId;
    const router = useRouter();

    const init = initialFromServer(serverResult);
    const [loading, setLoading] = useState(init.loading);
    const [reportData, setReportData] = useState<ReportData | null>(init.reportData);
    const [error, setError] = useState<string | null>(init.error);
    const skipClientFetch = init.skipClientFetch;

    // ── Refinement state ──────────────────────────────────────────────────────
    const [refineOpen, setRefineOpen] = useState(false);
    const [refineText, setRefineText] = useState('');
    const [refinePhotos, setRefinePhotos] = useState<
        Array<{
            id: string;
            previewSrc: string;
            file: File;
            uploading: boolean;
            uploadedUrl: string | null;
        }>
    >([]);
    const [isRefining, setIsRefining] = useState(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [refineTrigger, setRefineTrigger] = useState<'user' | 'photo_request'>('user');
    const refineFileRef = useRef<HTMLInputElement>(null);

    // Persist to localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !id?.trim() || error || !reportData) return;
        try {
            const key = 'mendr_my_reports';
            // Fall back to the legacy key once so existing saved reports carry over.
            const raw =
                window.localStorage.getItem(key) ?? window.localStorage.getItem('scandio_my_reports');
            const list: Array<{ conversationId: string; title: string; date: string }> = raw
                ? JSON.parse(raw)
                : [];
            if (!list.some((r) => r.conversationId === id)) {
                list.unshift({
                    conversationId: id,
                    title: (reportData.diagnosis as any)?.diagnosis
                        ? `Report: ${String((reportData.diagnosis as any).diagnosis).slice(0, 40)}…`
                        : `Report ${new Date().toLocaleDateString()}`,
                    date: new Date().toISOString(),
                });
                window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
            }
        } catch {
            // ignore
        }
    }, [id, reportData, error]);

    // ── Cost estimate ─────────────────────────────────────────────────────────
    // Show the static estimate immediately, then upgrade to the researched,
    // cached value from /api/cost-estimate when it is available. Kept at the top
    // (above the loading/error early returns) to respect the rules of hooks.
    const [costEstimate, setCostEstimate] = useState<{
        label: string;
        note: string | null;
    } | null>(null);
    useEffect(() => {
        const raw = (reportData?.diagnosis as { subcategory_id?: unknown } | null)
            ?.subcategory_id;
        const sub = typeof raw === 'string' ? raw : null;
        setCostEstimate(getCostEstimate(sub));
        if (!sub) return;
        let cancelled = false;
        void fetch(`/api/cost-estimate?subcategoryId=${encodeURIComponent(sub)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { estimate?: { label: string; note: string | null } | null } | null) => {
                if (!cancelled && j?.estimate) setCostEstimate(j.estimate);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [reportData]);

    const loadReport = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            let conv: Record<string, unknown> | null = null;

            const { data: d1, error: e1 } = await supabase
                .from('diagnoses')
                .select(
                    'diagnosis, image_url, image_urls, customer_address, customer_lat, customer_lng, initial_image_description',
                )
                .eq('id', id)
                .maybeSingle();

            if (e1) {
                const msg =
                    e1 && typeof e1 === 'object' && 'message' in e1
                        ? String((e1 as { message: unknown }).message)
                        : '';
                if (
                    typeof msg === 'string' &&
                    msg.includes('diagnosis') &&
                    msg.includes('does not exist')
                ) {
                    const { data: d2, error: e2 } = await supabase
                        .from('diagnoses')
                        .select(
                            'diagnosis_json, image_url, image_urls, customer_address, customer_lat, customer_lng, initial_image_description',
                        )
                        .eq('id', id)
                        .maybeSingle();
                    if (e2) throw e2;
                    conv = d2 as Record<string, unknown> | null;
                    if (conv && 'diagnosis_json' in conv) {
                        conv.diagnosis = conv.diagnosis_json;
                    }
                } else {
                    throw e1;
                }
            } else {
                conv = d1 as Record<string, unknown> | null;
            }

            if (!conv) {
                setError('Report not found.');
                return;
            }

            const resolvedDiagnosis = conv.diagnosis as Record<string, unknown> | null;
            const rawArr = (conv as { image_urls?: unknown }).image_urls;
            let imageUrls: string[] = [];
            if (Array.isArray(rawArr)) {
                imageUrls = (rawArr as unknown[])
                    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                    .map((u) => u.trim());
            }
            const legacyImageUrl =
                typeof conv.image_url === 'string' && (conv.image_url as string).trim()
                    ? (conv.image_url as string).trim()
                    : null;
            if (imageUrls.length === 0 && legacyImageUrl) {
                imageUrls = [legacyImageUrl];
            }

            setReportData({
                diagnosis: resolvedDiagnosis,
                image_url: legacyImageUrl ?? imageUrls[0] ?? null,
                imageUrls,
                customer_address: conv.customer_address as string | null,
                customer_lat: conv.customer_lat as number | null,
                customer_lng: conv.customer_lng as number | null,
                initial_image_description:
                    typeof (conv as { initial_image_description?: unknown })
                        .initial_image_description === 'string'
                        ? (conv as { initial_image_description: string })
                              .initial_image_description
                        : null,
            });
        } catch (e: unknown) {
            const errMsg =
                e && typeof e === 'object' && 'message' in e
                    ? String((e as { message: unknown }).message)
                    : e instanceof Error
                      ? e.message
                      : 'Unknown error';
            console.error('Load report error:', errMsg, e);
            setError('Failed to load report.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!id || skipClientFetch) return;
        loadReport();
    }, [id, loadReport, skipClientFetch]);

    const handleShare = useCallback(async () => {
        const url =
            typeof window !== 'undefined'
                ? `${window.location.origin}/report/${id}`
                : `/report/${id}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'My Mendr Diagnosis Report',
                    text: 'Here is my home diagnosis report from Mendr.',
                    url,
                });
                return;
            } catch {
                // fall through to clipboard
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Report link copied to clipboard');
        } catch {
            toast.error('Could not copy link');
        }
    }, [id]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    // ── Refinement helpers ────────────────────────────────────────────────────
    const isHeicLike = (file: File): boolean => {
        const type = (file.type || '').toLowerCase();
        const name = (file.name || '').toLowerCase();
        return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/i.test(name);
    };

    const readFileAsDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                    resolve(result);
                    return;
                }
                reject(new Error('Could not read the selected image.'));
            };
            reader.onerror = () =>
                reject(reader.error ?? new Error('Could not read the selected image.'));
            reader.readAsDataURL(file);
        });

    const uploadOnePhoto = useCallback(
        async (photoId: string, file: File) => {
            try {
                const form = new FormData();
                form.set('conversationId', id);
                form.set('file', file);
                const res = await fetch('/api/upload-image', { method: 'POST', body: form });
                if (!res.ok) throw new Error('Upload failed');
                const json = (await res.json().catch(() => null)) as {
                    imageUrl?: string;
                } | null;
                const url =
                    typeof json?.imageUrl === 'string' && json.imageUrl.startsWith('http')
                        ? json.imageUrl
                        : null;
                setRefinePhotos((prev) =>
                    prev.map((p) =>
                        p.id === photoId ? { ...p, uploading: false, uploadedUrl: url } : p,
                    ),
                );
            } catch {
                setRefinePhotos((prev) =>
                    prev.map((p) =>
                        p.id === photoId ? { ...p, uploading: false, uploadedUrl: null } : p,
                    ),
                );
            }
        },
        [id],
    );

    const handleRefinePhotosSelected = useCallback(
        async (incoming: FileList | null) => {
            if (!incoming || incoming.length === 0) return;
            const files = Array.from(incoming).filter(
                (f) => f.type.startsWith('image/') || isHeicLike(f),
            );
            if (files.length === 0) return;
            const currentExistingCount = reportData
                ? Array.isArray(reportData.imageUrls) && reportData.imageUrls.length > 0
                    ? reportData.imageUrls.length
                    : reportData.image_url
                      ? 1
                      : 0
                : 0;
            const currentlySelected = refinePhotos.length;
            const slots = Math.max(0, 4 - currentExistingCount - currentlySelected);
            if (slots === 0) {
                toast.error('Maximum 4 photos per diagnosis.');
                return;
            }
            const filesToProcess = files.slice(0, slots);

            for (const file of filesToProcess) {
                const photoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                try {
                    let raw = await readFileAsDataUrl(file);
                    if (isHeicLike(file)) {
                        const form = new FormData();
                        form.set('file', file);
                        const res = await fetch('/api/convert-heic', {
                            method: 'POST',
                            body: form,
                        });
                        const json = (await res.json().catch(() => ({}))) as {
                            dataUrl?: string;
                        };
                        if (
                            !res.ok ||
                            typeof json.dataUrl !== 'string' ||
                            !json.dataUrl.startsWith('data:image/')
                        ) {
                            throw new Error('Could not convert HEIC image.');
                        }
                        raw = json.dataUrl;
                    }
                    const compressed = await compressImage(raw);
                    // Rebuild File from compressed data URL
                    const [meta, base64] = compressed.split(',');
                    const mimeMatch = meta?.match(/data:(.*?);base64/);
                    const mime = mimeMatch?.[1] || 'image/jpeg';
                    const binStr = atob(base64 || '');
                    const len = binStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i += 1) bytes[i] = binStr.charCodeAt(i);
                    const ext = mime.includes('png')
                        ? 'png'
                        : mime.includes('webp')
                          ? 'webp'
                          : 'jpg';
                    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
                    const normalised = new File([bytes], `${base}.${ext}`, { type: mime });

                    setRefinePhotos((prev) => [
                        ...prev,
                        {
                            id: photoId,
                            previewSrc: compressed,
                            file: normalised,
                            uploading: true,
                            uploadedUrl: null,
                        },
                    ]);
                    void uploadOnePhoto(photoId, normalised);
                } catch {
                    toast.error('Could not process this image.');
                }
            }
        },
        [refinePhotos.length, reportData, uploadOnePhoto],
    );

    const removeRefinePhoto = useCallback((photoId: string) => {
        setRefinePhotos((prev) => prev.filter((p) => p.id !== photoId));
    }, []);

    const openRefineSheet = useCallback((trigger: 'user' | 'photo_request') => {
        setRefineTrigger(trigger);
        setRefineError(null);
        setRefineOpen(true);
    }, []);

    const submitRefinement = useCallback(async () => {
        if (!reportData) return;
        const trimmedText = refineText.trim();
        const readyUrls = refinePhotos
            .map((p) => p.uploadedUrl)
            .filter((u): u is string => typeof u === 'string' && u.length > 0);
        const stillUploading = refinePhotos.some((p) => p.uploading);
        if (stillUploading) {
            setRefineError('Wait for photos to finish uploading.');
            return;
        }
        if (!trimmedText && readyUrls.length === 0) {
            setRefineError('Add a photo or some text first.');
            return;
        }
        setIsRefining(true);
        setRefineError(null);
        try {
            const res = await fetch(`/api/diagnoses/${encodeURIComponent(id)}/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    additionalText: trimmedText || undefined,
                    additionalImageUrls: readyUrls.length > 0 ? readyUrls : undefined,
                    trigger: refineTrigger,
                }),
            });
            const json = (await res.json().catch(() => null)) as {
                diagnosis?: DiagnosisData;
                imageUrls?: string[];
                error?: string;
            } | null;
            if (!res.ok || !json?.diagnosis) {
                throw new Error(json?.error || 'Refinement failed.');
            }
            const newImageUrls = Array.isArray(json.imageUrls) ? json.imageUrls : [];
            setReportData((prev) =>
                prev
                    ? {
                          ...prev,
                          diagnosis: json.diagnosis as unknown as Record<string, unknown>,
                          imageUrls: newImageUrls,
                          image_url: newImageUrls[0] ?? prev.image_url,
                      }
                    : prev,
            );
            const addedCount = readyUrls.length;
            toast.success(
                addedCount > 0
                    ? `Diagnosis updated with ${addedCount} new photo${addedCount === 1 ? '' : 's'}.`
                    : 'Diagnosis updated.',
            );
            setRefineOpen(false);
            setRefineText('');
            setRefinePhotos([]);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Refinement failed.';
            setRefineError(msg);
        } finally {
            setIsRefining(false);
        }
    }, [id, reportData, refineText, refinePhotos, refineTrigger]);

    // ── Error / loading states ─────────────────────────────────────────────────

    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Invalid report link.</p>
            </div>
        );
    }

    if (loading || (!reportData && !error)) {
        /*
         * SKELETON — mirrors the loaded report layout in the main return below.
         * It reuses the exact same <main> wrapper (flex-col gap-6 p-4 pt-22
         * pb-22) and renders the real fixed top header, so there is zero
         * layout shift when the report data arrives. Blocks, top to bottom:
         *   Fixed header: real back button + "Mendr Report" title (static —
         *     available immediately, so it is NOT skeletoned).
         *   Banner image: h-56 w-full rounded-lg (matches the real banner).
         *   Title row: title bar (h-8 w-2/3) + trade badge (h-6 w-16).
         *   Two subtitle lines (trade detail / customer address).
         *   "What's Wrong": section label + 4 body lines (100/95/90/70%).
         *   Typical Cost card: h-24 rounded-lg.
         *   "How I worked this out" card: h-20 rounded-lg.
         * ⚠️ This skeleton MUST track the loaded layout in the main return
         * below. If you add, remove, or reorder a section, resize the banner
         * (h-56), or change the <main> wrapper spacing (gap-6 / pt-22 / pb-22),
         * update this skeleton to match so the page does not jump when the
         * report finishes loading.
         */
        return (
            <main className="flex flex-col gap-6 p-4 pt-22 pb-22 bg-background min-h-screen">
                {/* Fixed top header — identical to the loaded view */}
                <div className="no-print flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => router.back()}
                        aria-label="Back"
                    >
                        <ArrowLeft className="size-5" aria-hidden />
                    </Button>
                    <h3 className="text-lg text-foreground font-semibold truncate max-w-[min(280px,55vw)] text-center">
                        Mendr Report
                    </h3>
                    <div className="h-10 w-10 shrink-0" aria-hidden />
                </div>

                {/* Banner image */}
                <Skeleton className="h-56 w-full rounded-lg" />

                {/* Title + trade badge */}
                <div className="flex flex-col gap-2">
                    <div className="flex flex-row justify-between items-start gap-3">
                        <Skeleton className="h-8 w-2/3 rounded" />
                        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-1/2 rounded" />
                    <Skeleton className="h-4 w-3/5 rounded" />
                </div>

                {/* What's Wrong */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-28 rounded" />
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-4 w-[95%] rounded" />
                        <Skeleton className="h-4 w-[90%] rounded" />
                        <Skeleton className="h-4 w-[70%] rounded" />
                    </div>
                </div>

                {/* Typical Cost card */}
                <Skeleton className="h-24 w-full rounded-lg" />

                {/* How I worked this out card */}
                <Skeleton className="h-20 w-full rounded-lg" />
            </main>
        );
    }

    if (error || !reportData) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">{error ?? 'Report not found.'}</p>
            </div>
        );
    }

    // ── Derived values ─────────────────────────────────────────────────────────

    const diag = reportData.diagnosis;
    const isRejected = diag?.rejected === true;
    const isUnserviced = diag?.unserviced === true && !diag?.rejected;

    // Prefer the canonical `imageUrls` array; fall back to `image_url` for
    // older diagnoses that pre-date the multi-image migration.
    const allImages: string[] =
        Array.isArray(reportData.imageUrls) && reportData.imageUrls.length > 0
            ? reportData.imageUrls
            : reportData.image_url
              ? [reportData.image_url]
              : [];
    const bannerImage = allImages[0] ?? null;
    const extraImages = allImages.slice(1);

    const diagnosisTitle =
        typeof diag?.diagnosis === 'string' && diag.diagnosis !== 'N/A' ? diag.diagnosis : null;
    const trade = typeof diag?.trade === 'string' && diag.trade !== 'N/A' ? diag.trade : null;
    const tradeDetail =
        typeof diag?.trade_detail === 'string' && diag.trade_detail.trim()
            ? diag.trade_detail
            : null;
    const diagMessage =
        typeof diag?.message === 'string' && diag.message.trim()
            ? sanitizeAiContent(diag.message)
            : null;

    const thoughtParagraph = reportThoughtsParagraph(
        diag,
        reportData.initial_image_description ?? undefined,
    );

    const { detail: diagnosisDetailBody, hazard: diagnosisHazard } = splitDetailAndHazard(
        diagMessage ?? '',
    );
    const diagnosisDisplayBody = (diagnosisDetailBody || diagMessage || '').trim() || null;

    // New structured fields — fall back gracefully for older diagnoses.
    const contractorChecklist: string[] = Array.isArray(diag?.contractor_checklist)
        ? (diag.contractor_checklist as unknown[]).filter(
              (s): s is string => typeof s === 'string' && s.trim().length > 0,
          )
        : [];
    const homeownerPrep =
        typeof diag?.homeowner_prep === 'string' && diag.homeowner_prep.trim()
            ? sanitizeAiContent(diag.homeowner_prep)
            : null;

    // Fallback: older diagnoses that have action_required but no homeowner_prep.
    const legacyActionRequired =
        !homeownerPrep &&
        typeof diag?.action_required === 'string' &&
        diag.action_required.trim() &&
        diag.action_required !== 'N/A'
            ? sanitizeAiContent(String(diag.action_required))
            : null;

    // v7.0 additive fields — optional, gracefully absent on older diagnoses.
    const failedComponent =
        typeof diag?.failed_component === 'string' && diag.failed_component.trim()
            ? diag.failed_component
            : null;
    const cascadingDamage =
        typeof diag?.cascading_damage === 'string' && diag.cascading_damage.trim()
            ? diag.cascading_damage
            : null;
    const diyVerification =
        typeof diag?.diy_verification === 'string' && diag.diy_verification.trim()
            ? sanitizeAiContent(diag.diy_verification)
            : null;
    const confidenceDrivers: string[] = Array.isArray(diag?.confidence_drivers)
        ? (diag.confidence_drivers as unknown[]).filter(
              (s): s is string => typeof s === 'string' && s.trim().length > 0,
          )
        : [];
    const photoRequest =
        typeof diag?.photo_request === 'string' && diag.photo_request.trim()
            ? sanitizeAiContent(diag.photo_request)
            : null;

    // v7.3 additive field — structured per-image observations.
    type Observation = {
        primary_observation: string;
        components_visible: string[];
        components_missing_or_damaged: string[];
        role_in_diagnosis:
            | 'primary_evidence'
            | 'corroborating'
            | 'contradicting'
            | 'context_only';
    };
    const VALID_OBS_ROLES = [
        'primary_evidence',
        'corroborating',
        'contradicting',
        'context_only',
    ] as const;
    const imageObservations: Observation[] = Array.isArray(
        (diag as { image_observations?: unknown } | null | undefined)?.image_observations,
    )
        ? ((diag as { image_observations: unknown[] }).image_observations as unknown[])
              .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
              .map((o) => ({
                  primary_observation:
                      typeof o.primary_observation === 'string' ? o.primary_observation : '',
                  components_visible: Array.isArray(o.components_visible)
                      ? (o.components_visible as unknown[]).filter(
                            (s): s is string => typeof s === 'string' && s.trim().length > 0,
                        )
                      : [],
                  components_missing_or_damaged: Array.isArray(o.components_missing_or_damaged)
                      ? (o.components_missing_or_damaged as unknown[]).filter(
                            (s): s is string => typeof s === 'string' && s.trim().length > 0,
                        )
                      : [],
                  role_in_diagnosis:
                      typeof o.role_in_diagnosis === 'string' &&
                      (VALID_OBS_ROLES as ReadonlyArray<string>).includes(o.role_in_diagnosis)
                          ? (o.role_in_diagnosis as Observation['role_in_diagnosis'])
                          : 'context_only',
              }))
        : [];
    const hasObservations = imageObservations.length > 0;
    const hasContradictingObservation = imageObservations.some(
        (o) => o.role_in_diagnosis === 'contradicting',
    );
    const existingImageCount = allImages.length;
    const remainingPhotoSlots = Math.max(0, 4 - existingImageCount);

    const jobTitle = tradeToJobTitle(trade);

    const showDiagnosisSection = !isRejected && !isUnserviced && Boolean(diagnosisDisplayBody);

    const hasLocation = reportData.customer_lat != null && reportData.customer_lng != null;
    const mapDestination = hasLocation
        ? `${reportData.customer_lat},${reportData.customer_lng}`
        : (reportData.customer_address ?? null);
    const directionsHref = mapDestination
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination)}`
        : null;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Print-only styles */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                }
            `}</style>

            <main className="flex flex-col gap-6 p-4 pt-22 pb-22 bg-background min-h-screen">
                {/* ── Fixed top header ── */}
                <div className="no-print flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => router.back()}
                        aria-label="Back"
                    >
                        <ArrowLeft className="size-5" aria-hidden />
                    </Button>
                    <h3 className="text-lg text-foreground font-semibold truncate max-w-[min(280px,55vw)] text-center">
                        Mendr Report
                    </h3>
                    <div className="h-10 w-10 shrink-0" aria-hidden />
                </div>

                {/* ── Banner image (matches diagnosis page frame) ── */}
                {bannerImage ? (
                    <div className="overflow-hidden rounded-lg border border-input bg-secondary">
                        <img src={bannerImage} alt="" className="h-56 w-full object-cover" />
                    </div>
                ) : (
                    <div className="flex h-56 rounded-lg border border-input bg-secondary" />
                )}

                {/* ── Title + trade badge ── */}
                <div className="flex flex-col gap-2">
                    <div className="flex flex-row justify-between items-start gap-3">
                        <h1 className="text-2xl text-foreground font-bold leading-tight">
                            {diagnosisTitle ?? 'Diagnosis Report'}
                        </h1>
                        {trade && (
                            <Badge variant="secondary" className="shrink-0 mt-0.5">
                                {trade}
                            </Badge>
                        )}
                    </div>
                    {tradeDetail && trade !== tradeDetail && (
                        <p className="text-sm text-muted-foreground">{tradeDetail}</p>
                    )}
                    {failedComponent ? (
                        <p className="text-sm text-muted-foreground">
                            Component identified:{' '}
                            <span className="text-foreground font-medium">
                                {failedComponent}
                            </span>
                        </p>
                    ) : null}
                    {failedComponent && cascadingDamage ? (
                        <p className="text-sm text-muted-foreground">
                            Secondary effect:{' '}
                            <span className="text-foreground">{cascadingDamage}</span>
                        </p>
                    ) : null}
                    {reportData.customer_address && (
                        <p className="text-sm text-muted-foreground">
                            {reportData.customer_address}
                        </p>
                    )}
                    {directionsHref ? (
                        <Button variant="secondary" className="h-10 w-full sm:w-auto" asChild>
                            <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                Get Directions
                            </a>
                        </Button>
                    ) : null}
                </div>

                {/* ── Unrelated / unserviced notices ── */}
                {isRejected && (
                    <UnrelatedImageCard conversationId={id} recordFeedback={false} />
                )}
                {isUnserviced && (
                    <UnservicedCategoryCard
                        conversationId={id}
                        requestedService={String(diag?.trade ?? 'Unknown')}
                        diagnosis={
                            typeof diag?.diagnosis === 'string' ? diag.diagnosis : undefined
                        }
                        diagnosisFull={diag ?? undefined}
                        recordFeedback={false}
                    />
                )}

                {/* ── What's Wrong ── */}
                {/*
                 * The message field is now produced as 3-4 paragraphs separated by \n\n
                 * (Phase 1 prompt change). Split into proper <p> blocks so the visual
                 * structure reflects the prompt structure, rather than collapsing into
                 * a single whitespace-pre-wrap wall of text.
                 */}
                {showDiagnosisSection ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-foreground">
                            What&rsquo;s Wrong
                        </p>
                        <div className="flex flex-col gap-3">
                            {(diagnosisDisplayBody ?? '')
                                .split(/\n{2,}/)
                                .map((para) => para.trim())
                                .filter((para) => para.length > 0)
                                .map((para, i) => (
                                    <p
                                        key={i}
                                        className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                                    >
                                        {para}
                                    </p>
                                ))}
                        </div>
                        {diagnosisHazard ? (
                            <p className="text-sm text-foreground leading-relaxed border-l-2 border-destructive/50 pl-3">
                                {diagnosisHazard}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {/* ── Typical Cost ── */}
                {!isRejected && !isUnserviced && costEstimate ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Typical Cost Estimate
                        </p>
                        <p className="text-base font-semibold text-foreground">
                            {costEstimate.label}
                        </p>
                        {costEstimate.note ? (
                            <p className="text-xs text-muted-foreground">{costEstimate.note}</p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground/70">
                            Western Cape market rates · does not include your specific scope
                        </p>
                    </div>
                ) : null}

                {/* ── Photo request prompt (model is explicitly asking for a photo) ── */}
                {!isRejected && !isUnserviced && photoRequest ? (
                    <div className="no-print flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                        <div className="flex items-start gap-2">
                            <Camera
                                size={16}
                                strokeWidth={2.5}
                                className="mt-0.5 shrink-0 text-primary"
                            />
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-foreground">
                                    A photo would help me be more sure
                                </p>
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                    {photoRequest}
                                </p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => openRefineSheet('photo_request')}
                            className="w-full sm:w-auto"
                            disabled={remainingPhotoSlots === 0}
                        >
                            {remainingPhotoSlots === 0 ? 'Photo limit reached' : 'Add a photo'}
                        </Button>
                    </div>
                ) : null}

                {/* ── You can verify this yourself ── */}
                {!isRejected && !isUnserviced && diyVerification ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-foreground">
                            You can verify this yourself
                        </p>
                        <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary/50 pl-3">
                            {diyVerification}
                        </p>
                    </div>
                ) : null}

                {/* ── The [Trade]'s Checklist ── */}
                {!isRejected && !isUnserviced && contractorChecklist.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-foreground">
                            The {jobTitle}&rsquo;s Checklist
                        </p>
                        <ul className="flex flex-col gap-2">
                            {contractorChecklist.map((item, i) => (
                                <li
                                    key={i}
                                    className="flex gap-2.5 text-sm text-foreground leading-relaxed"
                                >
                                    <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-foreground/30" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* ── Before They Arrive ── */}
                {!isRejected && !isUnserviced && (homeownerPrep || legacyActionRequired) ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-foreground">
                            Before They Arrive
                        </p>
                        <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary/50 pl-3">
                            {homeownerPrep ?? legacyActionRequired}
                        </p>
                    </div>
                ) : null}

                {/* ── How I worked this out (thought + confidence drivers) ── */}
                {thoughtParagraph ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            How I worked this out
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            {thoughtParagraph}
                        </p>
                        {confidenceDrivers.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-1">
                                {confidenceDrivers.map((d, i) => (
                                    <li
                                        key={i}
                                        className="flex gap-2 text-xs text-muted-foreground"
                                    >
                                        <span className="mt-[5px] size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                                        <span>{d}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}

                {/* ── Per-image observations (v7.3) ── */}
                {hasObservations && allImages.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-foreground font-medium">
                            Photos &amp; observations
                        </p>

                        {hasContradictingObservation ? (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
                                Note: one of your photos suggests a different cause. Read the
                                per-image notes below.
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-4">
                            {allImages.map((url, i) => {
                                const obs = imageObservations[i];
                                const role = obs?.role_in_diagnosis;
                                const badge = (() => {
                                    if (role === 'primary_evidence') {
                                        return {
                                            label: 'Primary evidence',
                                            className:
                                                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                                        };
                                    }
                                    if (role === 'corroborating') {
                                        return {
                                            label: 'Supports diagnosis',
                                            className:
                                                'bg-secondary text-foreground border-border',
                                        };
                                    }
                                    if (role === 'contradicting') {
                                        return {
                                            label: 'Conflicts with diagnosis',
                                            className:
                                                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
                                        };
                                    }
                                    return {
                                        label: 'Context',
                                        className:
                                            'bg-muted text-muted-foreground border-border',
                                    };
                                })();

                                return (
                                    <div
                                        key={i}
                                        className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 overflow-hidden"
                                    >
                                        <div className="overflow-hidden bg-secondary">
                                            <img
                                                src={url}
                                                alt=""
                                                className="h-48 w-full object-cover sm:h-56"
                                            />
                                        </div>
                                        {obs ? (
                                            <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                                        Image {i + 1}
                                                    </p>
                                                    <span
                                                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                {obs.primary_observation ? (
                                                    <p className="text-sm text-foreground leading-relaxed">
                                                        {obs.primary_observation}
                                                    </p>
                                                ) : null}
                                                {obs.components_visible.length > 0 ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        <span className="font-medium text-foreground/80">
                                                            Visible components:
                                                        </span>{' '}
                                                        {obs.components_visible.join(', ')}
                                                    </p>
                                                ) : null}
                                                {obs.components_missing_or_damaged.length >
                                                0 ? (
                                                    <p className="text-xs text-foreground/80">
                                                        <span className="font-medium">
                                                            Issues spotted:
                                                        </span>{' '}
                                                        {obs.components_missing_or_damaged.join(
                                                            ', ',
                                                        )}
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    extraImages.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-foreground font-medium">Photos</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {extraImages.map((url, i) => (
                                    <div
                                        key={i}
                                        className="aspect-square overflow-hidden rounded-lg bg-secondary"
                                    >
                                        <img
                                            src={url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                )}

                {/* ── Fixed bottom action bar ── */}
                <div className="no-print flex flex-row gap-2 p-4 bg-background border-t border-border w-full fixed inset-x-0 bottom-0 z-50">
                    {!isRejected && !isUnserviced ? (
                        <Button
                            variant="secondary"
                            className="flex-1 h-10"
                            onClick={() => openRefineSheet('user')}
                            type="button"
                        >
                            Refine
                        </Button>
                    ) : null}
                    <Button
                        variant="secondary"
                        className="flex-1 h-10"
                        onClick={handleShare}
                        type="button"
                    >
                        Share
                    </Button>
                    <Button
                        variant="default"
                        className="flex-1 h-10"
                        onClick={handlePrint}
                        type="button"
                    >
                        Download PDF
                    </Button>
                </div>

                {/* ── Refinement spinner overlay ── */}
                {isRefining ? (
                    <div className="no-print fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm">
                        <Spinner className="size-8 text-foreground" />
                        <p className="text-sm font-medium text-foreground">
                            Refining diagnosis…
                        </p>
                    </div>
                ) : null}

                {/* ── Refinement sheet ── */}
                <Sheet open={refineOpen} onOpenChange={setRefineOpen}>
                    <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>Refine this diagnosis</SheetTitle>
                            <SheetDescription>
                                Add a clearer photo or extra details and I&rsquo;ll re-assess.
                                New photos are weighted most heavily.
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex flex-col gap-4 p-4">
                            {/* Photo picker */}
                            <input
                                ref={refineFileRef}
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                className="sr-only"
                                onChange={(e) => {
                                    void handleRefinePhotosSelected(e.target.files);
                                    e.currentTarget.value = '';
                                }}
                            />

                            <div className="flex flex-col gap-2">
                                <p className="text-sm font-medium text-foreground">
                                    Add photos
                                </p>
                                {refinePhotos.length > 0 ? (
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {refinePhotos.map((p) => (
                                            <div
                                                key={p.id}
                                                className="relative w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={p.previewSrc}
                                                    alt=""
                                                    className="h-24 w-full object-cover"
                                                />
                                                {p.uploading ? (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                                                        <Loader className="size-4 animate-spin text-foreground" />
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => removeRefinePhoto(p.id)}
                                                    aria-label="Remove photo"
                                                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-[10px] font-semibold text-foreground shadow-sm hover:bg-background"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-9 w-full"
                                    disabled={remainingPhotoSlots - refinePhotos.length <= 0}
                                    onClick={() => refineFileRef.current?.click()}
                                >
                                    <Camera className="size-4 shrink-0" aria-hidden />
                                    {remainingPhotoSlots - refinePhotos.length <= 0
                                        ? 'Photo limit reached'
                                        : 'Add photo'}
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    You have{' '}
                                    {Math.max(0, remainingPhotoSlots - refinePhotos.length)}{' '}
                                    photo slot
                                    {Math.max(0, remainingPhotoSlots - refinePhotos.length) ===
                                    1
                                        ? ''
                                        : 's'}{' '}
                                    remaining (4 max per diagnosis).
                                </p>
                            </div>

                            {/* Text input */}
                            <div className="flex flex-col gap-2">
                                <p className="text-sm font-medium text-foreground">
                                    Anything else to add?
                                </p>
                                <Textarea
                                    value={refineText}
                                    onChange={(e) => setRefineText(e.target.value)}
                                    placeholder="e.g. The spring on the right side is broken too — couldn't fit it in one photo."
                                    className="h-24 w-full resize-none"
                                    maxLength={2000}
                                />
                            </div>

                            {refineError ? (
                                <p className="text-sm text-destructive" role="alert">
                                    {refineError}
                                </p>
                            ) : null}

                            <div className="flex flex-col gap-2 pt-2">
                                <Button
                                    type="button"
                                    className="h-10 w-full"
                                    disabled={isRefining}
                                    onClick={() => void submitRefinement()}
                                >
                                    {isRefining ? (
                                        <>
                                            <Loader
                                                className="size-4 animate-spin shrink-0"
                                                aria-hidden
                                            />
                                            Refining…
                                        </>
                                    ) : (
                                        'Refine diagnosis'
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-10 w-full"
                                    disabled={isRefining}
                                    onClick={() => setRefineOpen(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </main>
        </>
    );
}
