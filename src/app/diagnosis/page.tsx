/**
 * Route: /welcome
 * First step in the scan flow. User uploads an image/video, then we continue to /diagnosis/[id].
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { getSupabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import type { DiagnosisData } from '@/app/chat/_components/types';
import { toast } from 'sonner';

export default function WelcomePage({ conversationId }: { conversationId?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trade = searchParams.get('trade') || '';
    const supabase = getSupabase();

    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isAddingInfo, setIsAddingInfo] = useState(false);
    const [infoText, setInfoText] = useState('');
    const infoTextareaRef = useRef<HTMLTextAreaElement>(null);
    // Avoid showing placeholder "Estimated Diagnosis" once we reach the /diagnosis/[id] route.
    const [diagnosisTitle, setDiagnosisTitle] = useState('Diagnosing…');
    const [customerInfoItems, setCustomerInfoItems] = useState<string[]>([]);
    const [thoughtText, setThoughtText] = useState('');
    const [diagnosisDetailText, setDiagnosisDetailText] = useState('');
    const [hazardText, setHazardText] = useState('');
    const [tradeLabel, setTradeLabel] = useState('');
    const [serviceCatalog, setServiceCatalog] = useState<string[]>([]);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const didRunDiagnosisRef = useRef<string | null>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    const parseDiagnosisFromResponse = (text: string): DiagnosisData | null => {
        const jsonBlockMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
        const candidate = jsonBlockMatch?.[1] ?? text;
        const braceMatch = candidate.match(/\{[\s\S]*\}/);
        const toParse = braceMatch ? braceMatch[0] : candidate;
        try {
            const parsed = JSON.parse(toParse);
            if (parsed && typeof parsed === 'object' && parsed.diagnosis) {
                return parsed as DiagnosisData;
            }
        } catch {
            // ignore
        }
        return null;
    };

    const parseThoughtFromResponse = (text: string): string => {
        // Accept all known thought wrappers produced by the model.
        const tagged =
            text.match(/<(?:thought|thinking|thought_process)\s*>([\s\S]*?)<\/(?:thought|thinking|thought_process)\s*>/i)?.[1] ??
            text.match(/```(?:thought|thinking)\s*([\s\S]*?)```/i)?.[1] ??
            '';
        if (tagged.trim()) return tagged.trim();

        // Fallback: if model emits plain text before JSON, treat it as thought.
        const jsonStart = text.search(/<json\s*>|\{[\s\n]*"[^"]*"\s*:\s*"/i);
        if (jsonStart > 0) {
            const beforeJson = text.slice(0, jsonStart).trim();
            const cleaned = beforeJson
                .replace(/^<(?:thought|thinking|thought_process)[^>]*>/i, '')
                .replace(/<\/?(?:thought|thinking|thought_process)\s*>/gi, '')
                .trim();
            if (cleaned.length > 0) return cleaned;
        }
        return '';
    };

    const cleanThoughtSentenceStarts = (text: string): string => {
        const fillers = /^[("'`\s-]*(a|an|the|this|it|there)\b[\s,:-]*/i;
        return text
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
                const cleaned = s.replace(fillers, '').trim();
                if (!cleaned) return s;
                return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
            })
            .join(' ')
            .trim();
    };

    const splitDetailAndHazard = (text: string): { detail: string; hazard: string } => {
        const raw = (text || '').trim();
        if (!raw) return { detail: '', hazard: '' };

        const sentences = raw
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);

        const hazardPattern =
            /\b(avoid|do not|don't|dont|never|risk|danger|unsafe|shock|fire|flood|leak|gas|switch off|turn off|isolate|unplug|stop using)\b/i;

        const hazardSentences = sentences.filter((s) => hazardPattern.test(s));
        if (hazardSentences.length === 0) {
            return { detail: raw, hazard: '' };
        }

        const hazardSet = new Set(hazardSentences);
        const detailSentences = sentences.filter((s) => !hazardSet.has(s));
        return {
            detail: detailSentences.join(' ').trim(),
            hazard: hazardSentences.slice(0, 3).join(' ').trim(),
        };
    };

    const runInitialDiagnosis = useCallback(
        async (img: string, prompt: string, selectedService: string | null) => {
            const cid = conversationId ?? null;
            // Prevent duplicate in-flight calls (Next dev Strict Mode can double-invoke effects).
            if (!cid) return null;
            if (didRunDiagnosisRef.current === cid) return null;
            didRunDiagnosisRef.current = cid;
            setIsDiagnosing(true);
            try {
                let catalog = serviceCatalog;
                if (catalog.length === 0) {
                    const { data } = await supabase
                        .from('services')
                        .select('label')
                        .eq('active', true)
                        .order('sort_order', { ascending: true });
                    catalog = Array.isArray(data)
                        ? data
                              .map((r: any) => String(r?.label ?? '').trim())
                              .filter((x: string) => x.length > 0)
                        : [];
                    if (catalog.length > 0) setServiceCatalog(catalog);
                }
                if (catalog.length === 0) {
                    toast.error('Could not load services catalog.');
                    return null;
                }

                const res = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: img,
                    serviceCatalog: catalog,
                    ...(prompt.trim() ? { textQuery: prompt.trim() } : {}),
                    ...(selectedService
                        ? {
                              userSelectedTrade: {
                                  trade: selectedService,
                                  diagnosis: `${selectedService} services`,
                              },
                          }
                        : {}),
                }),
                });

                const text = await res.text();
                if (!res.ok) {
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed?.error) toast.error(String(parsed.error));
                    } catch {
                        // ignore parse failures
                    }
                    return null;
                }

                const diag = parseDiagnosisFromResponse(text);
                if (!diag) {
                    toast.error('Could not understand the diagnosis response.');
                    return null;
                }

                const thoughtFromJson =
                    Array.isArray((diag as any)?.image_descriptions) &&
                    typeof (diag as any).image_descriptions[0] === 'string'
                        ? String((diag as any).image_descriptions[0]).trim()
                        : '';
                const thought =
                    parseThoughtFromResponse(text) ||
                    (diag.thinking ?? '').trim() ||
                    thoughtFromJson;
                setThoughtText(cleanThoughtSentenceStarts(thought));
                const diagWithThought: DiagnosisData = { ...diag, thinking: thought };
                const detail =
                    (diagWithThought.action_required ?? '').trim() ||
                    (diagWithThought.message ?? '').trim() ||
                    '';
                const split = splitDetailAndHazard(detail);
                setDiagnosisDetailText(split.detail);
                setHazardText(split.hazard);
                setTradeLabel((diagWithThought.trade ?? '').trim());

                setDiagnosisTitle(diagWithThought.diagnosis);

                try {
                    const deviceType =
                        typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
                            ? 'mobile'
                            : 'desktop';
                    await supabase
                        .from('conversations')
                        .upsert({
                            id: conversationId,
                            title: diagWithThought.diagnosis || 'New Diagnosis',
                            image_url: img,
                            diagnosis: diagWithThought,
                            initial_image_description: (prompt ?? '').trim() || null,
                            device: deviceType,
                            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                        })
                        .select('id')
                        .single();
                } catch {
                    // Non-fatal: still show title even if persistence fails.
                }

                return diagWithThought;
            } finally {
                setIsDiagnosing(false);
            }
        },
        [conversationId, supabase]
    );

    useEffect(() => {
        let cancelled = false;
        const loadServices = async () => {
            const { data } = await supabase
                .from('services')
                .select('label')
                .eq('active', true)
                .order('sort_order', { ascending: true });
            if (cancelled) return;
            const labels = Array.isArray(data)
                ? data
                      .map((r: any) => String(r?.label ?? '').trim())
                      .filter((x: string) => x.length > 0)
                : [];
            setServiceCatalog(labels);
        };
        void loadServices();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            if (!conversationId) return;
            // Reset guard when the route id changes.
            didRunDiagnosisRef.current = null;
            setDiagnosisTitle('Diagnosing…');
            // Show uploaded image immediately while conversation row is loading.
            try {
                const immediateImageUrl = sessionStorage.getItem(
                    `pending_diagnosis_image_url:${conversationId}`
                );
                if (immediateImageUrl) setImageSrc(immediateImageUrl);
            } catch {
                // Ignore session storage issues.
            }

            const { data } = await supabase
                .from('conversations')
                .select('id,image_url,diagnosis,initial_image_description')
                .eq('id', conversationId)
                .maybeSingle();

            if (cancelled) return;
            const img = (data as any)?.image_url as string | null;
            setImageSrc(img);
            const prompt = ((data as any)?.initial_image_description as string | null) ?? '';
            const customerInfo = prompt.trim();
            setCustomerInfoItems(customerInfo ? [customerInfo] : []);
            const existingDiagnosis = (data as any)?.diagnosis as DiagnosisData | null;

            if (existingDiagnosis?.diagnosis) {
                setDiagnosisTitle(existingDiagnosis.diagnosis);
                const persistedThinking = (existingDiagnosis.thinking ?? '').trim();
                const persistedImageDescriptions =
                    Array.isArray((existingDiagnosis as any)?.image_descriptions) &&
                    typeof (existingDiagnosis as any).image_descriptions[0] === 'string'
                        ? String((existingDiagnosis as any).image_descriptions[0]).trim()
                        : '';
                setThoughtText(
                    cleanThoughtSentenceStarts(persistedThinking || persistedImageDescriptions)
                );
                const persistedSplit = splitDetailAndHazard(
                    (existingDiagnosis.action_required ?? '').trim() ||
                        (existingDiagnosis.message ?? '').trim() ||
                        ''
                );
                setDiagnosisDetailText(persistedSplit.detail);
                setHazardText(persistedSplit.hazard);
                setTradeLabel((existingDiagnosis.trade ?? '').trim());
                return;
            }

            if (!img) {
                toast.error('No uploaded image found for this diagnosis.');
                return;
            }
            const selectedService = trade.trim() || null;
            await runInitialDiagnosis(img, prompt, selectedService);
        };

        void bootstrap().finally(() => {
            if (!cancelled) setIsPageLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [conversationId, runInitialDiagnosis, supabase, trade]);

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;

            setIsUploading(true);
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
                const conversationId = crypto.randomUUID();
                setImageData(conversationId, finalDataUrl, file.name);

                const qp = new URLSearchParams();
                if (trade) qp.set('trade', trade);
                const suffix = qp.toString() ? `?${qp.toString()}` : '';

                router.push(`/diagnosis/${conversationId}${suffix}`);
            } finally {
                setIsUploading(false);
            }
        },
        [router, trade]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
        e.target.value = '';
    };

    const showSkeleton = isPageLoading || isDiagnosing;
    const isUnsupportedDiagnosis =
        tradeLabel.trim().toLowerCase() === 'n/a' ||
        diagnosisTitle.toLowerCase().includes('not currently supported') ||
        diagnosisTitle.toLowerCase().includes('not on scandio');
    const isUnrelatedDiagnosis =
        diagnosisTitle.toLowerCase().includes('not related to home maintenance');
    const canContinueToMatch =
        !showSkeleton &&
        !isUnsupportedDiagnosis &&
        !isUnrelatedDiagnosis &&
        diagnosisTitle.trim().length > 0 &&
        !diagnosisTitle.toLowerCase().includes('diagnosing');
    const fallbackUnsupportedDetail =
        serviceCatalog.length > 0
            ? `Issue appears outside currently supported services on Scandio. Services currently available are: ${serviceCatalog.join(', ')}. If this seems incorrect, add more information below and send it so we can reassess.`
            : 'Issue appears outside currently supported services on Scandio. If this seems incorrect, add more information below and send it so we can reassess.';
    const fallbackUnrelatedDetail =
        'Uploaded photo does not appear related to a home maintenance issue. Please upload a clear image of the problem area and add extra information below if needed so we can reassess.';
    const resolvedDetailText =
        diagnosisDetailText ||
        (isUnrelatedDiagnosis
            ? fallbackUnrelatedDetail
            : isUnsupportedDiagnosis
              ? fallbackUnsupportedDetail
              : '');

    return (
        <main
            className={`flex flex-col gap-6 p-4 pt-22 ${
                isAddingInfo ? 'pb-49' : 'pb-22'
            }`}
        >
            <div className="flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50">
                <Button variant="secondary" size="icon" className="h-10 w-10" onClick={() => router.back()}>
                    <ArrowLeft className="size-5" />
                </Button>
                <h3 className="text-lg text-foreground font-semibold">Scandio</h3>
                <Button variant="ghost" size="icon" className="hover:bg-transparent" />
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl text-foreground font-bold">Right, Here&apos;s Something</h1>
                <p className="text-sm text-muted-foreground">
                    What&apos;re seeing based on your photo. You know your home better than we do, so let us know if something feels off.
                </p>
            </div>

            {customerInfoItems.length > 0 ? (
                <div className="flex flex-col items-start gap-2">
                    {customerInfoItems.map((item, idx) => (
                        <div
                            key={`${idx}-${item.slice(0, 20)}`}
                            className="text-xs text-foreground bg-secondary rounded-md px-3 py-2"
                        >
                            {item}
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="flex flex-col gap-3">
                {showSkeleton ? <Skeleton className="h-7 w-1/2" /> : <h3 className="text-lg text-foreground font-bold">{diagnosisTitle}</h3>}
                <div className="overflow-hidden rounded-lg border border-input bg-secondary">
                    {imageSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageSrc} alt="" className="h-64 w-full object-cover" />
                    ) : (
                        <div className="h-64 w-full" />
                    )}
                </div>
                {showSkeleton ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-4/5" />
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">{thoughtText || ''}</p>
                )}
            </div>

            {showSkeleton ? (
                <>
                    <div className="rounded-lg border border-input p-3 space-y-4">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-28 rounded-full" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-11/12" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-10/12" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col gap-3">
                    {!isUnsupportedDiagnosis && !isUnrelatedDiagnosis ? (
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{tradeLabel || 'Not Specified'}</Badge>
                        </div>
                    ) : null}

                    <p className="text-sm text-foreground">{resolvedDetailText}</p>
                    {isUnsupportedDiagnosis && serviceCatalog.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Supported services on Scandio: {serviceCatalog.join(', ')}.
                        </p>
                    ) : null}
                    {hazardText ? <p className="text-sm text-foreground">{hazardText}</p> : null}
                </div>
            )}

            {!isAddingInfo ? (
                <div className="flex flex-row gap-2 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
                    <Button
                        variant="ghost"
                        className="flex flex-1 h-10"
                        disabled={showSkeleton}
                        onClick={() => {
                            setIsAddingInfo(true);
                            // Let the textarea mount before focusing.
                            setTimeout(() => infoTextareaRef.current?.focus(), 0);
                        }}
                    >
                        Add Information
                    </Button>
                    <Button
                        variant="default"
                        className="flex flex-1 h-10"
                        disabled={!canContinueToMatch}
                        onClick={() => {
                            if (!conversationId) return;
                            if (conversationId) {
                                const key = `pending_diagnosis_image_url:${conversationId}`;
                                try {
                                    sessionStorage.removeItem(key);
                                } catch {}
                                try {
                                    localStorage.removeItem(key);
                                } catch {}
                            }
                            router.push(`/match/${encodeURIComponent(conversationId)}`);
                        }}
                    >
                        Find Someone Great
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-3 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
                    <div className="flex flex-col gap-3">
                        <Label htmlFor="diagnosis-info-text" className="text-sm text-foreground">
                            Add Information
                        </Label>
                        <Textarea
                            id="diagnosis-info-text"
                            ref={infoTextareaRef}
                            value={infoText}
                            onChange={(e) => setInfoText(e.target.value)}
                            disabled={showSkeleton}
                            className="text-sm min-h-[64px] resize-none"
                        />
                    </div>

                    <div className="flex flex-row gap-3">
                        <Button
                            variant="ghost"
                            className="flex flex-1 h-10"
                            disabled={showSkeleton}
                            onClick={() => {
                                setIsAddingInfo(false);
                                setInfoText('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="default"
                            className="flex flex-1 h-10"
                            disabled={!infoText.trim() || isDiagnosing || showSkeleton}
                            onClick={async () => {
                                const trimmed = infoText.trim();
                                if (!trimmed) return;

                                const nextItems = [...customerInfoItems, trimmed];
                                const joinedInfo = nextItems.join('\n\n').trim();
                                setCustomerInfoItems(nextItems);
                                setIsAddingInfo(false);
                                setInfoText('');

                                if (conversationId) {
                                    try {
                                        await supabase
                                            .from('conversations')
                                            .upsert({
                                                id: conversationId,
                                                initial_image_description: joinedInfo || null,
                                            })
                                            .select('id')
                                            .single();
                                    } catch {
                                        // Non-fatal; keep UI responsive.
                                    }
                                }

                                if (imageSrc) {
                                    // Allow intentional re-run for this same conversation.
                                    didRunDiagnosisRef.current = null;
                                    setDiagnosisTitle('Diagnosing…');
                                    await runInitialDiagnosis(
                                        imageSrc,
                                        joinedInfo,
                                        trade.trim() || null
                                    );
                                }
                            }}
                        >
                            {isDiagnosing ? 'Updating…' : 'Send'}
                        </Button>
                    </div>
                </div>
            )}
        </main>
    );
}

