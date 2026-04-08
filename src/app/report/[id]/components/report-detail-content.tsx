'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { sanitizeAiContent } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { UnrelatedImageCard } from '@/app/chat/components/unrelated-image-card';
import { UnservicedCategoryCard } from '@/app/chat/components/unserviced-category-card';
import {
    diagnosisSectionsDuplicate,
    reportThoughtsParagraph,
    splitDetailAndHazard,
} from '@/lib/diagnosis-display';
import type { ReportDetailServerResult } from '@/lib/fetch-report-detail-server';

type ReportData = {
    diagnosis: Record<string, unknown> | null;
    image_url: string | null;
    customer_address: string | null;
    customer_lat: number | null;
    customer_lng: number | null;
    initial_image_description: string | null;
    messages?: {
        content: string;
        role: string;
        attachments?: string[];
        diagnosis?: Record<string, unknown> | null;
    }[];
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
        return { loading: false, reportData: serverResult.data, error: null, skipClientFetch: true };
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

    // Persist to localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !id?.trim() || error || !reportData) return;
        try {
            const key = 'scandio_my_reports';
            const raw = window.localStorage.getItem(key);
            const list: Array<{ conversationId: string; title: string; date: string }> = raw
                ? JSON.parse(raw)
                : [];
            if (!list.some((r) => r.conversationId === id)) {
                list.unshift({
                    conversationId: id,
                    title:
                        (reportData.diagnosis as any)?.diagnosis
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

    const loadReport = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            let conv: Record<string, unknown> | null = null;

            const { data: d1, error: e1 } = await supabase
                .from('diagnoses')
                .select(
                    'diagnosis, image_url, customer_address, customer_lat, customer_lng, initial_image_description'
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
                            'diagnosis_json, image_url, customer_address, customer_lat, customer_lng, initial_image_description'
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

            const { data: msgsRaw } = await (supabase as any)
                .from('messages')
                .select('content, role, attachments, diagnosis')
                .eq('conversation_id', id)
                .order('created_at', { ascending: true });

            const msgs = (msgsRaw ?? []) as Array<{
                content: string;
                role: string;
                attachments?: string[];
                diagnosis?: Record<string, unknown> | null;
            }>;

            let resolvedDiagnosis = conv.diagnosis as Record<string, unknown> | null;
            if (!resolvedDiagnosis) {
                const lastWithDiag = [...msgs]
                    .reverse()
                    .find(
                        (m) =>
                            m.role === 'assistant' &&
                            m.diagnosis &&
                            typeof m.diagnosis === 'object' &&
                            (m.diagnosis as Record<string, unknown>).diagnosis
                    );
                if (lastWithDiag?.diagnosis) {
                    resolvedDiagnosis = lastWithDiag.diagnosis as Record<string, unknown>;
                }
            }

            setReportData({
                diagnosis: resolvedDiagnosis,
                image_url: conv.image_url as string | null,
                customer_address: conv.customer_address as string | null,
                customer_lat: conv.customer_lat as number | null,
                customer_lng: conv.customer_lng as number | null,
                initial_image_description:
                    typeof (conv as { initial_image_description?: unknown }).initial_image_description === 'string'
                        ? (conv as { initial_image_description: string }).initial_image_description
                        : null,
                messages: msgs || [],
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
                    title: 'My Scandio Diagnosis Report',
                    text: 'Here is my home diagnosis report from Scandio.',
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

    // ── Error / loading states ─────────────────────────────────────────────────

    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Invalid report link.</p>
            </div>
        );
    }

    if (loading || (!reportData && !error)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
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

    const allImages: string[] = [];
    if (reportData.image_url) allImages.push(reportData.image_url);
    reportData.messages?.forEach((m) => {
        m.attachments?.forEach((url) => {
            if (url && !allImages.includes(url)) allImages.push(url);
        });
    });
    const bannerImage = allImages[0] ?? null;
    const extraImages = allImages.slice(1);

    const diagnosisTitle =
        typeof diag?.diagnosis === 'string' && diag.diagnosis !== 'N/A'
            ? diag.diagnosis
            : null;
    const trade =
        typeof diag?.trade === 'string' && diag.trade !== 'N/A' ? diag.trade : null;
    const tradeDetail =
        typeof diag?.trade_detail === 'string' && diag.trade_detail.trim()
            ? diag.trade_detail
            : null;
    const actionRequired =
        typeof diag?.action_required === 'string' &&
        diag.action_required !== 'N/A' &&
        diag.action_required.trim()
            ? sanitizeAiContent(String(diag.action_required))
            : null;
    const diagMessage =
        typeof diag?.message === 'string' && diag.message.trim()
            ? sanitizeAiContent(diag.message)
            : null;

    const thoughtParagraph = reportThoughtsParagraph(
        diag,
        reportData.initial_image_description ?? undefined
    );

    const { detail: diagnosisDetailBody, hazard: diagnosisHazard } = splitDetailAndHazard(
        diagMessage ?? ''
    );
    const diagnosisDisplayBody =
        (diagnosisDetailBody || diagMessage || '').trim() || null;

    const hasMessage = Boolean(diagMessage?.trim());
    const hasAction = Boolean(actionRequired?.trim());
    const sectionsDup = hasMessage && hasAction && diagnosisSectionsDuplicate(diagMessage, actionRequired);
    const showDiagnosisSection =
        !isRejected && !isUnserviced && hasMessage && Boolean(diagnosisDisplayBody);
    const showRecommendedSection =
        !isRejected && !isUnserviced && hasAction && !sectionsDup;

    const hasLocation =
        reportData.customer_lat != null && reportData.customer_lng != null;
    const mapDestination = hasLocation
        ? `${reportData.customer_lat},${reportData.customer_lng}`
        : reportData.customer_address ?? null;
    const directionsHref = mapDestination
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination)}`
        : null;
    const mapEmbedSrc = mapDestination
        ? `https://maps.google.com/maps?q=${encodeURIComponent(mapDestination)}&z=15&output=embed`
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
                        Scandio Report
                    </h3>
                    <div className="h-10 w-10 shrink-0" aria-hidden />
                </div>

                {/* ── Banner image (matches diagnosis page frame) ── */}
                {bannerImage ? (
                    <div className="overflow-hidden rounded-lg border border-input bg-secondary">
                        <img
                            src={bannerImage}
                            alt=""
                            className="h-56 w-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="flex h-56 rounded-lg border border-input bg-secondary" />
                )}

                {thoughtParagraph ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">{thoughtParagraph}</p>
                ) : null}

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
                    {reportData.customer_address && (
                        <p className="text-sm text-muted-foreground">
                            {reportData.customer_address}
                        </p>
                    )}
                </div>

                {/* ── Unrelated / unserviced notices ── */}
                {isRejected && (
                    <UnrelatedImageCard
                        conversationId={id}
                        diagnosisMessage={reportData.messages?.[0]?.content}
                        recordFeedback={false}
                    />
                )}
                {isUnserviced && (
                    <UnservicedCategoryCard
                        conversationId={id}
                        requestedService={String(diag?.trade ?? 'Unknown')}
                        diagnosis={typeof diag?.diagnosis === 'string' ? diag.diagnosis : undefined}
                        diagnosisFull={diag ?? undefined}
                        recordFeedback={false}
                    />
                )}

                {/* ── Diagnosis & recommended action (aligned with match-page section labels) ── */}
                {!isRejected && !isUnserviced && (showDiagnosisSection || showRecommendedSection) ? (
                    <div className="flex flex-col gap-4">
                        {showDiagnosisSection ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-sm text-foreground font-medium">Diagnosis</p>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                    {diagnosisDisplayBody}
                                </p>
                                {diagnosisHazard ? (
                                    <p className="text-sm text-foreground font-medium leading-relaxed border-l-2 border-primary/40 pl-3">
                                        {diagnosisHazard}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                        {showRecommendedSection ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-sm text-foreground font-medium">Recommended Action</p>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                    {actionRequired}
                                </p>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* ── Extra photos ── */}
                {extraImages.length > 0 && (
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
                )}

                {/* ── Location / map ── */}
                {mapEmbedSrc && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-foreground font-medium">Location</p>
                        <div className="overflow-hidden rounded-lg border border-border bg-secondary">
                            <div className="h-52 w-full">
                                <iframe
                                    title="Job location"
                                    src={mapEmbedSrc}
                                    className="h-full w-full border-0 block"
                                    allowFullScreen
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </div>
                        </div>
                        {directionsHref && (
                            <Button variant="secondary" className="w-full h-10" asChild>
                                <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                    Get Directions
                                </a>
                            </Button>
                        )}
                    </div>
                )}

                {/* ── Fixed bottom action bar (text-only; PDF primary) ── */}
                <div className="no-print flex flex-row gap-2 p-4 bg-background border-t border-border w-full fixed inset-x-0 bottom-0 z-50">
                    <Button variant="secondary" className="flex-1 h-10" onClick={handleShare} type="button">
                        Share
                    </Button>
                    <Button variant="default" className="flex-1 h-10" onClick={handlePrint} type="button">
                        Download PDF
                    </Button>
                </div>
            </main>
        </>
    );
}
