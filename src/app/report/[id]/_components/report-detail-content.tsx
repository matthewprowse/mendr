'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { AppHeader } from '@/components/app-header';
import { sanitizeAiContent, parseRepairReplacementRanges } from '@/lib/utils';
import { calculateCalloutFee, CALLOUT_RATE_PER_KM } from '@/lib/pricing';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UnrelatedImageCard } from '@/app/chat/_components/unrelated-image-card';
import { UnservicedCategoryCard } from '@/app/chat/_components/unserviced-category-card';
import { ProvidersMap } from '@/app/chat/_components/providers-map';

type AttachmentItem = { url: string; type?: 'image' | 'video' | 'document' };

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
        attachment_urls?: AttachmentItem[];
        diagnosis?: Record<string, unknown> | null;
    }[];
};

export interface ReportDetailContentProps {
    reportId: string;
}

export function ReportDetailContent({ reportId }: ReportDetailContentProps) {
    const id = reportId;

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [directionsLoading, setDirectionsLoading] = useState(false);
    const [providerLocation, setProviderLocation] = useState<{ lat: number; lng: number } | null>(
        null
    );
    const [directionsAttempted, setDirectionsAttempted] = useState(false);
    const [directions, setDirections] = useState<{
        distance_text: string;
        distance_meters: number | null;
        duration_text: string;
    } | null>(null);

    const loadReport = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            // Support both 'diagnosis' (new) and 'diagnosis_json' (legacy) column names
            let conv: Record<string, unknown> | null = null;
            let convError: unknown = null;

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
                .select('content, role, attachments, attachment_urls, diagnosis')
                .eq('conversation_id', id)
                .order('created_at', { ascending: true });

            const msgs = (msgsRaw ?? []) as Array<{
                content: string;
                role: string;
                attachments?: string[];
                attachment_urls?: AttachmentItem[] | null;
                diagnosis?: Record<string, unknown> | null;
            }>;

            // If the conversation-level diagnosis is missing, fall back to the most
            // recent assistant message that carries a diagnosis object.
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
                messages: (msgs || []).map((m) => ({ ...m, attachment_urls: m.attachment_urls ?? undefined })),
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

    const fetchDirections = useCallback(async () => {
        const hasLoc = reportData?.customer_lat != null && reportData?.customer_lng != null;
        if (!reportData?.customer_address && !hasLoc) return;
        setDirectionsLoading(true);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
            );
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setProviderLocation({ lat, lng });
            const origin = `${lat},${lng}`;
            const destination = hasLoc
                ? `${reportData!.customer_lat},${reportData!.customer_lng}`
                : reportData!.customer_address!;
            const res = await fetch(
                `/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
            );
            const data = await res.json();
            if (data.distance_text && data.duration_text) {
                setDirections({
                    distance_text: data.distance_text,
                    distance_meters: data.distance_meters ?? null,
                    duration_text: data.duration_text,
                });
            }
        } catch {
            toast.error('Could not get your location or directions.');
        } finally {
            setDirectionsLoading(false);
        }
    }, [reportData]);

    useEffect(() => {
        if (
            reportData &&
            (reportData.customer_address ||
                (reportData.customer_lat != null && reportData.customer_lng != null)) &&
            !directionsAttempted
        ) {
            setDirectionsAttempted(true);
            fetchDirections();
        }
    }, [reportData, directionsAttempted, fetchDirections]);

    const mapsKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
    const hasLocation = reportData?.customer_lat != null && reportData?.customer_lng != null;
    const destinationForMap = hasLocation
        ? `${reportData!.customer_lat},${reportData!.customer_lng}`
        : reportData?.customer_address || '';
    const directionsMapUrl =
        providerLocation && hasLocation
            ? mapsKey
                ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${providerLocation.lat},${providerLocation.lng}&destination=${reportData!.customer_lat},${reportData!.customer_lng}`
                : `https://www.google.com/maps?output=embed&saddr=${providerLocation.lat},${providerLocation.lng}&daddr=${reportData!.customer_lat},${reportData!.customer_lng}`
            : null;
    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Invalid report link.</p>
            </div>
        );
    }

    if (loading || !reportData) {
        if (error && !loading) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-background">
                    <p className="text-muted-foreground">{error}</p>
                </div>
            );
        }
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    const diag = reportData.diagnosis;
    const isRejected = diag?.rejected === true;
    const isUnserviced = diag?.unserviced === true && !diag?.rejected;
    const allMedia: AttachmentItem[] = [];
    if (reportData.image_url) {
        allMedia.push({ url: reportData.image_url, type: 'image' });
    }
    reportData.messages?.forEach((m) => {
        const urls = m.attachment_urls?.length
            ? m.attachment_urls.map((a) => ({ url: a.url, type: (a.type === 'video' || a.type === 'document' ? a.type : 'image') as 'image' | 'video' | 'document' }))
            : (m.attachments ?? []).map((url) => ({ url: String(url), type: 'image' as const }));
        urls.forEach((item) => {
            if (item.url && !allMedia.some((x) => x.url === item.url)) allMedia.push(item);
        });
    });
    const mainMedia = allMedia[0];
    const additionalMedia = allMedia.slice(1);

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <AppHeader imageSrc={mainMedia?.url ?? null} showViewImage={false} />

            <main className="flex flex-1 flex-col overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full px-4 md:px-12 py-4 flex flex-col gap-8">
                    {/* Unrelated or unserviced notice */}
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
                    {/* Map - no card; distance/duration in bottom right when directions available */}
                    {(reportData.customer_address || hasLocation) && destinationForMap && (
                        <section className="w-full">
                            {mapsKey && hasLocation ? (
                                <div className="relative w-full overflow-hidden rounded-xl border border-border bg-background">
                                    <ProvidersMap
                                        apiKey={mapsKey}
                                        providers={[
                                            {
                                                name: 'Job Location',
                                                address: reportData.customer_address || '',
                                                summary: '',
                                                services: [],
                                                latitude: reportData.customer_lat as number,
                                                longitude: reportData.customer_lng as number,
                                            },
                                        ]}
                                        emergingProviders={[]}
                                        userLocation={providerLocation}
                                        hideFloatingCard
                                    />
                                    <div className="relative z-[110] mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                                        <span className="text-sm text-muted-foreground">
                                            {directions?.distance_text && directions?.duration_text
                                                ? `${directions.distance_text} · ${directions.duration_text} drive`
                                                : directions?.distance_text || directions?.duration_text || '\u00a0'}
                                        </span>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                window.open(
                                                    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                                        reportData.customer_address || destinationForMap
                                                    )}`,
                                                    '_blank'
                                                )
                                            }
                                        >
                                            Get Directions
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative w-full overflow-hidden rounded-lg border border-border bg-card">
                                    <div className="aspect-[16/10] min-h-[180px] w-full">
                                        {directionsLoading && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                            </div>
                                        )}
                                        <iframe
                                            title="Directions to job"
                                            src={
                                                directionsMapUrl ||
                                                `https://www.google.com/maps?q=${encodeURIComponent(
                                                    destinationForMap
                                                )}&output=embed`
                                            }
                                            className="w-full h-full border-0 block"
                                            allowFullScreen
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* Diagnosis - structured for service provider (skip when rejected/unserviced) */}
                    {!isRejected && !isUnserviced && (
                        <section className="space-y-6">
                            <div className="space-y-1">
                                <h2 className="text-lg font-semibold text-foreground">
                                    Job Summary
                                </h2>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Overview of the reported issue, required service, and
                                    recommended next steps.
                                </p>
                            </div>
                            <div className="grid gap-6">
                                {typeof diag?.diagnosis === 'string' && diag.diagnosis !== 'N/A' && (
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-2">
                                            Diagnosis
                                        </p>
                                        <p className="text-sm font-medium text-foreground">
                                            {diag.diagnosis}
                                        </p>
                                        {typeof diag?.message === 'string' && diag.message.trim() !== '' && (
                                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                                {sanitizeAiContent(diag.message)}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">
                                        Job Type
                                    </p>
                                    <Badge variant="secondary" className="text-sm font-medium">
                                        {typeof diag?.trade === 'string' && diag.trade !== 'N/A'
                                            ? diag.trade
                                            : 'Not specified'}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">
                                        Recommended Action
                                    </p>
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                        {typeof diag?.action_required === 'string' &&
                                        diag.action_required !== 'N/A' &&
                                        diag.action_required.trim() !== ''
                                            ? sanitizeAiContent(String(diag.action_required))
                                            : 'Not specified'}
                                    </p>
                                </div>
                                {(() => {
                                    const calloutExact =
                                        directions?.distance_meters != null
                                            ? calculateCalloutFee(directions.distance_meters)
                                            : null;
                                    const fallback = parseRepairReplacementRanges(
                                        String(diag?.repair_or_replacement_fee ?? '')
                                    );
                                    const repairRange =
                                        diag?.repair_cost_range &&
                                        String(diag.repair_cost_range) !== 'N/A'
                                            ? String(diag.repair_cost_range)
                                            : fallback.repair;
                                    const replacementRange =
                                        diag?.replacement_cost_range &&
                                        String(diag.replacement_cost_range) !== 'N/A'
                                            ? String(diag.replacement_cost_range)
                                            : fallback.replacement;
                                    const equipmentPartsRange =
                                        diag?.equipment_parts_range &&
                                        String(diag.equipment_parts_range) !== 'N/A'
                                            ? String(diag.equipment_parts_range)
                                            : null;

                                    // Simplified view: Call-out, Labour, Parts
                                    const labourRange = repairRange || replacementRange || null;
                                    const hasStructured =
                                        calloutExact || labourRange || equipmentPartsRange;
                                    const estimatedCostText =
                                        typeof diag?.estimated_cost === 'string' &&
                                        diag.estimated_cost !== 'N/A' &&
                                        diag.estimated_cost.trim() !== ''
                                            ? sanitizeAiContent(String(diag.estimated_cost))
                                            : null;

                                    const rows: { label: string; value: string }[] = [];
                                    if (calloutExact && directions?.distance_meters != null) {
                                        rows.push({
                                            label: 'Call-Out Fee',
                                            value: `${calloutExact} (${directions.distance_text} × R${CALLOUT_RATE_PER_KM}/km)`,
                                        });
                                    }
                                    if (labourRange) {
                                        rows.push({
                                            label: 'Labour',
                                            value: labourRange,
                                        });
                                    }
                                    if (equipmentPartsRange) {
                                        rows.push({
                                            label: 'Parts',
                                            value: equipmentPartsRange,
                                        });
                                    }

                                    return (
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Estimated Price
                                            </p>
                                            {hasStructured && rows.length > 0 ? (
                                                <>
                                                    <div className="rounded-lg border border-border">
                                                        <table className="w-full text-sm">
                                                            <tbody>
                                                                {rows.map((r, i) => (
                                                                    <tr
                                                                        key={i}
                                                                        className="border-b border-border last:border-b-0"
                                                                    >
                                                                        <td className="px-3 py-2.5 text-muted-foreground">
                                                                            {r.label}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-right text-foreground">
                                                                            {r.value}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                                                        Call-out based on distance. Labour and parts
                                                        are estimated ranges. Final price may differ
                                                        after on-site inspection.
                                                    </p>
                                                </>
                                            ) : null}
                                            {estimatedCostText && (
                                                <p className="text-sm text-foreground leading-relaxed">
                                                    {estimatedCostText}
                                                </p>
                                            )}
                                            {!hasStructured && !estimatedCostText && (
                                                <p className="text-sm text-muted-foreground">
                                                    No price estimate available. Quote can be
                                                    provided after on-site inspection.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </section>
                    )}

                    <Separator />

                    {/* Media - images and videos from diagnosis */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold text-foreground">Photos &amp; videos</h2>
                            {allMedia.length > 0 && (
                                <Badge variant="secondary" className="text-xs font-medium">
                                    {allMedia.length} item{allMedia.length !== 1 ? 's' : ''}
                                </Badge>
                            )}
                        </div>
                        {allMedia.length > 0 ? (
                            <>
                                {mainMedia && (
                                    <div className="rounded-lg border border-border overflow-hidden">
                                        {mainMedia.type === 'video' ? (
                                            <video
                                                src={mainMedia.url}
                                                controls
                                                playsInline
                                                className="w-full max-h-[480px] object-contain bg-muted"
                                            />
                                        ) : (
                                            <img
                                                src={mainMedia.url}
                                                alt=""
                                                className="w-full object-cover max-h-[480px]"
                                            />
                                        )}
                                    </div>
                                )}
                                {additionalMedia.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {additionalMedia.map((item, i) => (
                                            <div
                                                key={i}
                                                className="rounded-lg border border-border overflow-hidden aspect-square"
                                            >
                                                {item.type === 'video' ? (
                                                    <video
                                                        src={item.url}
                                                        controls
                                                        playsInline
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <img
                                                        src={item.url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">No photos or videos</p>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
