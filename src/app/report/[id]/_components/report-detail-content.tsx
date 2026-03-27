'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { sanitizeAiContent } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Share, Download } from 'lucide-react';
import { UnrelatedImageCard } from '@/app/chat/_components/unrelated-image-card';
import { UnservicedCategoryCard } from '@/app/chat/_components/unserviced-category-card';

type ReportData = {
    diagnosis: Record<string, unknown> | null;
    image_url: string | null;
    customer_address: string | null;
    customer_lat: number | null;
    customer_lng: number | null;
    messages?: {
        content: string;
        role: string;
        attachments?: string[];
        diagnosis?: Record<string, unknown> | null;
    }[];
};

export interface ReportDetailContentProps {
    reportId: string;
}

export function ReportDetailContent({ reportId }: ReportDetailContentProps) {
    const id = reportId;
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [error, setError] = useState<string | null>(null);

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
                .from('conversations')
                .select('diagnosis, image_url, customer_address, customer_lat, customer_lng')
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
                        .from('conversations')
                        .select(
                            'diagnosis_json, image_url, customer_address, customer_lat, customer_lng'
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
        if (!id) return;
        loadReport();
    }, [id, loadReport]);

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

    const mapsKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

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
                        className="h-10 w-10"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="size-5" />
                    </Button>
                    <h3 className="text-lg text-foreground font-semibold truncate max-w-[min(280px,55vw)] text-center">
                        Scandio Report
                    </h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={handleShare}
                        aria-label="Share report"
                    >
                        <Share className="size-4" />
                    </Button>
                </div>

                {/* ── Banner image ── */}
                {bannerImage ? (
                    <div className="relative h-52 w-full overflow-hidden rounded-lg bg-secondary">
                        <img
                            src={bannerImage}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="flex h-52 bg-secondary rounded-lg" />
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

                {/* ── Job summary ── */}
                {!isRejected && !isUnserviced && (diagMessage || actionRequired) && (
                    <div className="flex flex-col gap-4">
                        {diagMessage && (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Diagnosis
                                </p>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                    {diagMessage}
                                </p>
                            </div>
                        )}
                        {actionRequired && (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Recommended Action
                                </p>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                    {actionRequired}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Extra photos ── */}
                {extraImages.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Photos
                        </p>
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Location
                        </p>
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
                            <Button variant="secondary" className="w-full" asChild>
                                <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                    Get Directions
                                </a>
                            </Button>
                        )}
                    </div>
                )}

                {/* ── Fixed bottom action bar ── */}
                <div className="no-print flex flex-row gap-2 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
                    <Button
                        variant="ghost"
                        className="flex flex-1 h-10 gap-2"
                        onClick={handleShare}
                    >
                        <Share className="size-4" />
                        Share
                    </Button>
                    <Button
                        variant="secondary"
                        className="flex flex-1 h-10 gap-2"
                        onClick={handlePrint}
                    >
                        <Download className="size-4" />
                        Download PDF
                    </Button>
                </div>
            </main>
        </>
    );
}
