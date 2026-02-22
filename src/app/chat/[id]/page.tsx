/**
 * File: page.tsx
 * Description: The primary results page that handles AI image diagnosis,
 * local service provider discovery, and an interactive chat interface.
 * Route: /chat/[id]
 */

'use client';

import { useRouter, useParams } from 'next/navigation';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { getLocation, clearLocation } from '@/lib/location-store';
import { getImageData, clearImageData } from '@/lib/image-store';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { AppHeader } from '@/components/app-header';

import { sanitizeAiContent, tryParseDiagnosisJson, extractMessageFromRaw } from '@/lib/utils';
import { DiagnosisData, Message, Provider } from '../_components/types';
import { ChatMessage } from '../_components/chat-message';
import { ChatFooter } from '../_components/chat-footer';
import { DiagnosisResponseCard } from '../_components/diagnosis-response-card';

// --- Main Component ---

export default function ChatPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen w-full items-center justify-center bg-background">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            }
        >
            <ResultsContent />
        </Suspense>
    );
}

function ResultsContent() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string | undefined;

    // Don't read store during render to avoid hydration mismatch (server has no store; client might).
    // Store is applied in useEffect so first paint matches server.
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [hasStartedDiagnosis, setHasStartedDiagnosis] = useState(false);
    const diagnosisStartedRef = useRef(false);
    const [isResponding, setIsResponding] = useState(false);
    const [isLoadingProvidersForMessage, setIsLoadingProvidersForMessage] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [userLocation, setUserLocation] = useState<{
        lat: number;
        lng: number;
        address: string;
    } | null>(null);
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [pendingAttachments, setPendingAttachments] = useState<string[]>([]);
    const [directTradeSelection, setDirectTradeSelection] = useState<{
        trade: string;
        diagnosis: string;
    } | null>(null);
    const [directTradeResult, setDirectTradeResult] = useState<{
        trade: string;
        diagnosis: string;
        providers: Provider[];
    } | null>(null);
    const [isLoadingDirectProviders, setIsLoadingDirectProviders] = useState(false);
    const [headerScrolled, setHeaderScrolled] = useState(false);
    const [footerHeight, setFooterHeight] = useState(104);
    // --- Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const footerRef = useRef<HTMLElement>(null);
    const welcomeFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const el = footerRef.current;
        if (!el) return;
        const updateHeight = () => setFooterHeight(el.getBoundingClientRect().height);
        updateHeight();
        const ro = new ResizeObserver(updateHeight);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const startInitialDiagnosisAbortRef = useRef<AbortController | null>(null);

    const handleWelcomeUpload = async (file: File) => {
        if (!file || !id) return;
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) return;
        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const finalDataUrl = isImage ? await compressImage(base64) : base64;
                setImageSrc(finalDataUrl);
                setHasStartedDiagnosis(false);
                diagnosisStartedRef.current = false;
                setIsDiagnosing(true);
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Welcome upload failed:', err);
            setIsUploading(false);
        }
    };

    // --- Persistence & Usage ---

    const loadConversation = useCallback(
        async (getCancelled?: () => boolean) => {
            if (!id) return null;

            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database timeout')), 30000)
            );

            try {
                const fetchPromise = (async () => {
                    const [convResult, msgsResult] = await Promise.all([
                        supabase.from('conversations').select('*').eq('id', id),
                        supabase
                            .from('messages')
                            .select('*')
                            .eq('conversation_id', id)
                            .order('created_at', { ascending: true }),
                    ]);

                    if (convResult.error) throw convResult.error;

                    return { conv: convResult.data?.[0], msgs: msgsResult.data };
                })();

                const result = (await Promise.race([fetchPromise, timeout])) as {
                    conv?: any;
                    msgs?: any[];
                };
                if (getCancelled?.()) return null;

                const conv = result?.conv;
                const msgs = result?.msgs;

                if (conv) {
                    if (conv.image_url) setImageSrc(conv.image_url);
                    if (conv.diagnosis_json) setDiagnosis(conv.diagnosis_json);
                    if (conv.user_lat && conv.user_lng) {
                        setUserLocation({
                            lat: conv.user_lat,
                            lng: conv.user_lng,
                            address: conv.user_address || '',
                        });
                    }
                } else {
                    // Create empty conversation so we can insert messages later
                    await (supabase as any).from('conversations').upsert({
                        id,
                        title: 'New Diagnosis',
                        updated_at: new Date().toISOString(),
                    });
                }
                if (getCancelled?.()) return null;

                if (msgs && msgs.length > 0) {
                    const mappedMsgs = msgs.map((m: any) => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        attachments: m.attachments || [],
                        feedback: m.feedback as 'up' | 'down' | null,
                        hasUpdatedDiagnosis: m.has_updated_diagnosis,
                        diagnosis: m.diagnosis_json ?? undefined,
                        providers: m.providers_json ?? undefined,
                    }));
                    setMessages(mappedMsgs);
                    return mappedMsgs;
                }
            } catch (err) {
                if (!getCancelled?.()) {
                    console.error('Failed to load conversation:', err);
                }
            } finally {
                if (!getCancelled?.()) setIsLoaded(true);
            }
            return null;
        },
        [id]
    );

    const saveMessage = async (
        role: 'user' | 'assistant',
        content: string,
        attachments: string[] = [],
        hasUpdatedDiagnosis: boolean = false,
        diagnosisJson?: DiagnosisData | null,
        providersJson?: Provider[] | null
    ) => {
        if (!id) return;
        const { error } = await (supabase as any).from('messages').insert({
            conversation_id: id,
            role,
            content,
            attachments,
            has_updated_diagnosis: hasUpdatedDiagnosis,
            diagnosis_json: diagnosisJson ?? undefined,
            providers_json: providersJson ?? undefined,
        });
        if (error && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.warn('[Supabase] message:', error.code, error.message);
        }
    };

    const saveConversation = async (overrides?: {
        diag?: DiagnosisData;
        loc?: { lat: number; lng: number; address: string };
    }) => {
        if (!id) return;

        const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        const finalDiagnosis = overrides?.diag || diagnosis;
        const finalLocation = overrides?.loc || userLocation;

        const { error } = await (supabase as any).from('conversations').upsert({
            id,
            title: finalDiagnosis?.diagnosis || 'New Diagnosis',
            image_url: imageSrc,
            user_lat: finalLocation?.lat,
            user_lng: finalLocation?.lng,
            user_address: finalLocation?.address,
            diagnosis_json: finalDiagnosis,
            device_type: deviceType,
            user_agent: navigator.userAgent,
            user_id: null,
            updated_at: new Date().toISOString(),
        });
        if (error && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.warn('[Supabase] conversation:', error.code, error.message);
        }
        if (!error && finalDiagnosis?.diagnosis && typeof fetch !== 'undefined') {
            fetch(`/api/report-owner-token?conversation_id=${encodeURIComponent(id)}`).catch(() => {});
        }
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);


    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const updateMessageProviders = useCallback(
        async (messageIndex: number, providers: Provider[]) => {
            if (!id) return;
            try {
                const { data: all } = await (supabase as any)
                    .from('messages')
                    .select('id')
                    .eq('conversation_id', id)
                    .order('created_at', { ascending: true });
                const targetId = all?.[messageIndex]?.id;
                if (targetId) {
                    await (supabase as any).from('messages').update({ providers_json: providers }).eq('id', targetId);
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development') console.warn('[Supabase] updateMessageProviders:', e);
            }
        },
        [id]
    );

    const updateMessageContent = useCallback(
        async (messageIndex: number, content: string, diagnosis: DiagnosisData) => {
            if (!id) return;
            try {
                const { data: all } = await (supabase as any)
                    .from('messages')
                    .select('id')
                    .eq('conversation_id', id)
                    .order('created_at', { ascending: true });
                const targetId = all?.[messageIndex]?.id;
                if (targetId) {
                    await (supabase as any)
                        .from('messages')
                        .update({ content, diagnosis_json: diagnosis })
                        .eq('id', targetId);
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development') console.warn('[Supabase] updateMessageContent:', e);
            }
        },
        [id]
    );

    const fetchProvidersForMessage = useCallback(
        async (messageIndex: number, trade: string, lat: number, lng: number, msgContent: string, hasUpdatedDiag: boolean, diag: DiagnosisData) => {
            const validCoords =
                typeof lat === 'number' &&
                typeof lng === 'number' &&
                !isNaN(lat) &&
                !isNaN(lng);
            if (!trade || trade === 'N/A' || !validCoords) return;

            setIsLoadingProvidersForMessage(messageIndex);
            try {
                const res = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, trade }),
                });
                const data = await res.json();
                if (res.ok && data.providers) {
                    const withReviews = (data.providers as Provider[]).filter(
                        (p: Provider) => (p.ratingCount ?? 0) > 0
                    );
                    const toUse = withReviews.length > 0 ? withReviews : (data.providers as Provider[]);
                    const sorted = [...toUse].sort(
                        (a: Provider, b: Provider) =>
                            (b.rating ?? 0) - (a.rating ?? 0) ||
                            (b.ratingCount ?? 0) - (a.ratingCount ?? 0)
                    );
                    const count = sorted.length;
                    const take = Math.min(5, count); // 1 Scandio's Pick + 4 others
                    const finalProviders = sorted.slice(0, take);

                    setMessages((prev) => {
                        const next = [...prev];
                        const msg = next[messageIndex];
                        if (msg && msg.role === 'assistant') {
                            next[messageIndex] = { ...msg, providers: finalProviders };
                        }
                        return next;
                    });
                    updateMessageProviders(messageIndex, finalProviders);
                } else {
                    console.error('API Error:', data.error || 'Unknown error');
                    toast.error(data.error || 'Couldn\'t load providers. Try "Use my location" again.');
                }
            } catch (err) {
                console.error('Failed to fetch providers:', err);
                toast.error('Couldn\'t load providers. Check your connection and try again.');
            } finally {
                setIsLoadingProvidersForMessage(null);
            }
        },
        [updateMessageProviders]
    );

    const fetchDirectProviders = useCallback(
        async (trade: string, lat: number, lng: number, diagnosis: string) => {
            const validCoords =
                typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
            if (!trade || trade === 'N/A' || !validCoords) return;
            setIsLoadingDirectProviders(true);
            try {
                const res = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, trade }),
                });
                const data = await res.json();
                if (res.ok && data.providers) {
                    const withReviews = (data.providers as Provider[]).filter(
                        (p: Provider) => (p.ratingCount ?? 0) > 0
                    );
                    const sorted = [...withReviews].sort(
                        (a: Provider, b: Provider) =>
                            (b.rating ?? 0) - (a.rating ?? 0) ||
                            (b.ratingCount ?? 0) - (a.ratingCount ?? 0)
                    );
                    const count = sorted.length;
                    const take = Math.min(5, count); // 1 Scandio's Pick + 4 others
                    setDirectTradeResult({ trade, diagnosis, providers: sorted.slice(0, take) });
                    setDirectTradeSelection(null);
                } else {
                    setDirectTradeResult({ trade, diagnosis, providers: [] });
                    setDirectTradeSelection(null);
                }
            } catch {
                setDirectTradeResult({ trade, diagnosis, providers: [] });
                setDirectTradeSelection(null);
            } finally {
                setIsLoadingDirectProviders(false);
            }
        },
        []
    );

    const useLocationAndFetchProviders = useCallback(
        async (
            lat: number,
            lng: number,
            opts?: {
                messageIndex?: number;
                trade?: string;
                directTrade?: { trade: string; diagnosis: string };
                msgContent?: string;
                hasUpdatedDiagnosis?: boolean;
                diagnosis?: DiagnosisData;
            }
        ) => {
            const geocodePromise = fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng }),
            })
                .then((res) => res.json())
                .catch(() => ({ address: 'Current Location' }));

            try {
                const geoData = await geocodePromise;
                const address = geoData.address || 'Current Location';
                const loc = { lat, lng, address };
                setUserLocation(loc);
                saveConversation({ loc });
                clearLocation();
                if (opts?.directTrade) {
                    fetchDirectProviders(opts.directTrade.trade, lat, lng, opts.directTrade.diagnosis);
                } else if (opts?.messageIndex != null && opts?.trade) {
                    const msg = messages[opts.messageIndex];
                    const msgContent = msg?.content ?? opts.msgContent ?? '';
                    const diag = msg?.diagnosis ?? opts.diagnosis;
                    if (diag && (msg?.role === 'assistant' || opts.msgContent != null)) {
                        fetchProvidersForMessage(
                            opts.messageIndex,
                            opts.trade,
                            lat,
                            lng,
                            msgContent,
                            msg?.hasUpdatedDiagnosis ?? opts.hasUpdatedDiagnosis ?? false,
                            diag
                        );
                    }
                }
            } catch (e) {
                console.error('Error getting location:', e);
                setUserLocation({ lat, lng, address: 'Current Location' });
            }
        },
        [saveConversation, messages, fetchProvidersForMessage, fetchDirectProviders]
    );

    const cleanThinkingText = useCallback((s: string) =>
        s
            .replace(/<\/?(?:thought|thought_process|thinking)>/gi, '')
            .replace(/```(?:thought|thinking)/gi, '')
            .replace(/\s*```(?:json)?\s*$/gi, '')
            .replace(/^\s*```(?:json)?\s*/gi, '')
            .replace(/```/g, '')
            .replace(/[ \t]+/g, ' ')
            .trim(), []);

    /** Strip confidence from thinking for display only (e.g. "Confidence: 85%" or "I am 85% confident"). */
    const thinkingForDisplay = useCallback((s: string | undefined) => {
        if (!s?.trim()) return s ?? '';
        return s
            .split(/\n/)
            .map((line) =>
                line
                    .replace(/\s*(?:Confidence|I am|I'm)\s*:?\s*\d+\s*%?\s*confident\.?\s*/gi, '')
                    .replace(/\s*Confidence\s*:?\s*\d+\s*%?\s*\.?\s*$/gi, '')
                    .replace(/\s*\(\d+\s*%\s*confident\)\s*$/gi, '')
                    .trim()
            )
            .filter((line) => line.length > 0)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }, []);

    /** Build chat message content, stripping any thought/reasoning the AI mistakenly put in the message field. */
    const buildAssistantContent = useCallback(
        (parsedJson: { message?: string; diagnosis?: string; action_required?: string }, currentThinking: string) => {
            const fallback =
                (parsedJson.diagnosis || '') + '\n\n' + (parsedJson.action_required || '');
            let content = parsedJson.message || fallback;
            const thought = (currentThinking || '').trim();
            if (thought.length > 15 && content.includes(thought)) {
                content = content.replace(thought, '').replace(/\n{3,}/g, '\n\n').trim();
            }
            return sanitizeAiContent(content || fallback);
        },
        []
    );

    const getCurrentLocation = useCallback(
        (opts?: {
            messageIndex?: number;
            trade?: string;
            directTrade?: { trade: string; diagnosis: string };
            msgContent?: string;
            hasUpdatedDiagnosis?: boolean;
            diagnosis?: DiagnosisData;
        }) => {
            const doFetch = (lat: number, lng: number) => useLocationRef.current(lat, lng, opts);
            const stored = getLocation();
            if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
                doFetch(stored.lat, stored.lng);
                return;
            }

            if (typeof window !== 'undefined' && !window.isSecureContext) {
                if (opts?.directTrade) {
                    setIsLoadingDirectProviders(false);
                    setDirectTradeSelection(null);
                }
                toast.error(
                    'Location requires HTTPS. Please open this app via https:// (not http://) for location to work.'
                );
                return;
            }

            if (!navigator.geolocation) {
                if (opts?.directTrade) {
                    setIsLoadingDirectProviders(false);
                    setDirectTradeSelection(null);
                }
                toast.error(
                    'Location is not supported. Please use a modern browser with location access.'
                );
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    doFetch(lat, lng);
                },
                (err) => {
                    if (opts?.directTrade) {
                        setIsLoadingDirectProviders(false);
                        setDirectTradeSelection(null);
                    }
                    if (err.code === 1) {
                        toast.error(
                            'Location was denied. Tap your browser’s lock/info icon next to the address bar and allow location for this site, then try again.'
                        );
                    } else if (err.code === 3) {
                        toast.error(
                            'Location request timed out. Make sure location services are enabled on your device.'
                        );
                    } else {
                        toast.error('Could not get your location. Please try again.');
                    }
                },
                { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }
            );
        },
        []
    );

    const handleServiceSelect = useCallback((trade: string, diagnosis: string) => {
        setDirectTradeResult(null);
        setDirectTradeSelection({ trade, diagnosis });
    }, []);

    const handleGetCompaniesNow = useCallback(
        (directTrade: { trade: string; diagnosis: string }) => {
            setIsLoadingDirectProviders(true);
            const stored = getLocation();
            const hasLoc =
                typeof userLocation?.lat === 'number' &&
                typeof userLocation?.lng === 'number' &&
                !isNaN(userLocation.lat) &&
                !isNaN(userLocation.lng);
            if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
                useLocationAndFetchProviders(stored.lat, stored.lng, {
                    directTrade,
                });
                return;
            }
            if (hasLoc) {
                useLocationAndFetchProviders(userLocation!.lat, userLocation!.lng, {
                    directTrade,
                });
                return;
            }
            getCurrentLocation({ directTrade });
        },
        [userLocation, useLocationAndFetchProviders, getCurrentLocation]
    );

    const startInitialDiagnosis = useCallback(
        async (img: string, userContext?: { trade: string; diagnosis: string }) => {
            if (diagnosisStartedRef.current) return;
            diagnosisStartedRef.current = true;
            const initialMessageAddedRef = { current: false };
            const providersFetchStartedRef = { current: false };
            const earlyMessageIndexRef = { current: -1 };
            const abortController = new AbortController();
            startInitialDiagnosisAbortRef.current = abortController;
            setHasStartedDiagnosis(true);
            setIsDiagnosing(true);
            setDiagnosis((prev) => ({
                thinking: '',
                diagnosis: prev?.diagnosis || '',
                trade: prev?.trade || '',
                action_required: prev?.action_required || '',
                estimated_cost: prev?.estimated_cost || '',
            }));

            try {
                const res = await fetch('/api/diagnose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image: img,
                        ...(userContext && { userSelectedTrade: userContext }),
                    }),
                    signal: abortController.signal,
                });

                if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
                    toast.error(error.error || 'Failed to start analysis');
                    setIsDiagnosing(false);
                    setDiagnosis(null);
                    return;
                }

                if (!res.body) {
                    setIsDiagnosing(false);
                    setDiagnosis(null);
                    return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let currentThinking = '';

                while (true) {
                    const { done, value } = await reader.read();
                    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                    fullText += chunk;

                    if (done) {
                        if (!initialMessageAddedRef.current && !diagnosis?.diagnosis) {
                            const finalJsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                            if (finalJsonMatch) {
                                await processJson(finalJsonMatch[1], currentThinking, true);
                            } else {
                                const anyJsonMatch = fullText.match(/\{[\s\S]*\}/);
                                if (anyJsonMatch) {
                                    await processJson(anyJsonMatch[0], currentThinking, true);
                                }
                            }
                        }
                        break;
                    }

                    // Extract partial thinking so it shows immediately as the model streams
                    const thoughtOpen = fullText.search(/<(?:thought|thought_process|thinking)\s*>/i);
                    if (thoughtOpen !== -1) {
                        const afterOpen = fullText.slice(thoughtOpen).replace(/^<(?:thought|thought_process|thinking)\s*>/i, '');
                        const endClose = afterOpen.search(/<\/(?:thought|thought_process|thinking)\s*>/i);
                        const endJson = afterOpen.search(/<json\s*>/i);
                        const end = [endClose, endJson].filter((i) => i >= 0).length
                            ? Math.min(...[endClose, endJson].filter((i) => i >= 0))
                            : undefined;
                        const raw = (end !== undefined ? afterOpen.slice(0, end) : afterOpen).trim();
                        if (raw.length > 0) currentThinking = cleanThinkingText(raw);
                    } else {
                        const thoughtMatch =
                            fullText.match(
                                /<(?:thought|thought_process|thinking)>([\s\S]*?)(?:<\/(?:thought|thought_process|thinking)>|$)/i
                            ) || fullText.match(/```(?:thought|thinking)\s*([\s\S]*?)(?:```|$)/i);
                        if (thoughtMatch?.[1]) currentThinking = cleanThinkingText(thoughtMatch[1]);
                        else {
                            const jsonStart = fullText.search(/<json>|\{[\s\n]*"[^"]*"\s*:\s*"/i);
                            if (jsonStart > 10) {
                                const beforeJson = fullText.slice(0, jsonStart).trim();
                                const stripped = cleanThinkingText(
                                    beforeJson
                                        .replace(/^<(?:thought|thinking)[^>]*>/i, '')
                                        .replace(/<\/?(?:thought|thinking)>/gi, '')
                                );
                                if (stripped.length > 5) currentThinking = stripped;
                            }
                        }
                    }

                    if (currentThinking) {
                        setDiagnosis((prev) => ({
                            thinking: currentThinking,
                            diagnosis: prev?.diagnosis || '',
                            trade: prev?.trade || '',
                            action_required: prev?.action_required || '',
                            estimated_cost: prev?.estimated_cost || '',
                        }));
                    }

                    const jsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                    if (jsonMatch) {
                        await processJson(
                            jsonMatch[1],
                            currentThinking,
                            fullText.toLowerCase().includes('</json>')
                        );
                    } else {
                        const anyJsonMatch = fullText.match(/\{[\s\S]*\}/);
                        if (anyJsonMatch) {
                            await processJson(anyJsonMatch[0], currentThinking, false);
                        }
                    }
                }

                async function processJson(
                    jsonText: string,
                    thinking: string,
                    isComplete: boolean
                ) {
                    let cleaned = jsonText
                        .trim()
                        .replace(/^```json\s*/i, '')
                        .replace(/```$/i, '')
                        .trim();

                    try {
                        let toParse = cleaned;
                        if (!isComplete && !cleaned.endsWith('}')) {
                            const lastBrace = cleaned.lastIndexOf('}');
                            if (lastBrace !== -1) toParse = cleaned.substring(0, lastBrace + 1);
                        }

                        const parsedJson = JSON.parse(toParse);
                        if (parsedJson.diagnosis) {
                            setDiagnosis((prev) => ({
                                ...parsedJson,
                                thinking: (thinking && thinking.trim()) ? thinking : (prev?.thinking || ''),
                            }));

                            const diag = { thinking, ...parsedJson };
                            const conf = (parsedJson.confidence ?? 0) as number;
                            const canShowProvs =
                                !parsedJson.rejected &&
                                !parsedJson.requires_clarification &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A' &&
                                conf >= 85;
                            // Fetch providers immediately when we identify an actual issue (diagnosis + trade) — don't wait for high confidence
                            const canFetchEarly =
                                parsedJson.diagnosis &&
                                !parsedJson.rejected &&
                                !parsedJson.requires_clarification &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A';
                            const assistantContent =
                                parsedJson.message || `I identified a ${parsedJson.diagnosis}.`;

                            // When we identify an actual issue: add message and start provider fetch immediately (in parallel)
                            if (canFetchEarly && !providersFetchStartedRef.current) {
                                providersFetchStartedRef.current = true;
                                initialMessageAddedRef.current = true;
                                let newMsgIndex = 0;
                                setMessages((prev) => {
                                    newMsgIndex = prev.length;
                                    earlyMessageIndexRef.current = prev.length;
                                    return [
                                        ...prev,
                                        {
                                            role: 'assistant',
                                            content: assistantContent,
                                            feedback: null,
                                            diagnosis: diag,
                                            hasUpdatedDiagnosis: true,
                                        },
                                    ];
                                });
                                // Run saves and provider fetch in parallel — don't block on DB
                                void saveConversation({ diag });
                                void saveMessage('assistant', assistantContent, [], true, diag, undefined);
                                const loc = userLocation;
                                const hasLoc =
                                    typeof loc?.lat === 'number' &&
                                    typeof loc?.lng === 'number' &&
                                    !isNaN(loc.lat) &&
                                    !isNaN(loc.lng);
                                if (hasLoc) {
                                    fetchProvidersForMessage(
                                        newMsgIndex,
                                        parsedJson.trade,
                                        loc.lat,
                                        loc.lng,
                                        assistantContent,
                                        false,
                                        diag
                                    );
                                } else {
                                    getCurrentLocation({
                                        messageIndex: newMsgIndex,
                                        trade: parsedJson.trade,
                                        msgContent: assistantContent,
                                        hasUpdatedDiagnosis: false,
                                        diagnosis: diag,
                                    });
                                }
                            }

                            // On stream complete: either we already added (update existing) or add now
                            if (isComplete) {
                                if (initialMessageAddedRef.current) {
                                    // Update the existing message with final content (was added early at 75%)
                                    const msgIdx = earlyMessageIndexRef.current >= 0 ? earlyMessageIndexRef.current : 0;
                                    setMessages((prev) => {
                                        const lastIdx = prev.length - 1;
                                        if (lastIdx >= 0 && prev[lastIdx]?.role === 'assistant') {
                                            return prev.map((m, i) =>
                                                i === lastIdx
                                                    ? { ...m, content: assistantContent, diagnosis: diag }
                                                    : m
                                            );
                                        }
                                        return prev;
                                    });
                                    await saveConversation({ diag });
                                    updateMessageContent(msgIdx, assistantContent, diag);
                                } else {
                                    initialMessageAddedRef.current = true;
                                    await saveConversation({ diag });
                                    saveMessage('assistant', assistantContent, [], true, diag, undefined);
                                    let newMsgIndex = 0;
                                    setMessages((prev) => {
                                        newMsgIndex = prev.length;
                                        return [
                                            ...prev,
                                            {
                                                role: 'assistant',
                                                content: assistantContent,
                                                feedback: null,
                                                diagnosis: diag,
                                                hasUpdatedDiagnosis: true,
                                            },
                                        ];
                                    });
                                    const loc = userLocation;
                                    const hasLoc =
                                        typeof loc?.lat === 'number' &&
                                        typeof loc?.lng === 'number' &&
                                        !isNaN(loc.lat) &&
                                        !isNaN(loc.lng);
                                    if (canShowProvs) {
                                        if (hasLoc) {
                                            fetchProvidersForMessage(
                                                newMsgIndex,
                                                parsedJson.trade,
                                                loc.lat,
                                                loc.lng,
                                                assistantContent,
                                                false,
                                                diag
                                            );
                                        } else {
                                            getCurrentLocation({
                                                messageIndex: newMsgIndex,
                                                trade: parsedJson.trade,
                                                msgContent: assistantContent,
                                                hasUpdatedDiagnosis: false,
                                                diagnosis: diag,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('Diagnosis critical failure:', err);
                    toast.error('Diagnosis failed. Please check your internet connection.');
                    setDiagnosis(null);
                }
            } finally {
                setIsDiagnosing(false);
            }
        },
        [id, saveConversation, saveMessage, cleanThinkingText, userLocation, fetchProvidersForMessage, updateMessageContent]
    );

    const useLocationRef = useRef(useLocationAndFetchProviders);
    useLocationRef.current = useLocationAndFetchProviders;

    useEffect(() => () => {
        startInitialDiagnosisAbortRef.current?.abort();
        startInitialDiagnosisAbortRef.current = null;
    }, []);

    useEffect(() => {
        if (!id) return;

        const imageData = getImageData();
        if (imageData && imageData.id === id) {
            setImageSrc(imageData.dataUrl);
        }

        let cancelled = false;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        const getCancelled = () => cancelled;

        loadConversation(getCancelled).then((loadedMsgs) => {
            if (cancelled) return;
            if (imageData && imageData.id === id && (!loadedMsgs || loadedMsgs.length === 0)) {
                clearImageData();
            }
            if (loadedMsgs && loadedMsgs.length > 0) {
                setIsDiagnosing(false);
            }
            // Subscribe to realtime only after load completes - avoids React Strict Mode
            // and Fast Refresh closing the WebSocket before it connects
            channel = supabase
                .channel(`conv-${id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'conversations',
                        filter: `id=eq.${id}`,
                    },
                    (payload: { new: { diagnosis_json?: DiagnosisData } }) => {
                        if (payload.new.diagnosis_json && !cancelled) {
                            setDiagnosis(payload.new.diagnosis_json);
                        }
                    }
                )
                .subscribe();
        });

        return () => {
            cancelled = true;
            if (channel) supabase.removeChannel(channel);
        };
    }, [id, loadConversation]);

    // Request location once when chat loads so it's ready when diagnosis arrives
    // On mobile, this may fail without user gesture — user can tap "Use my location" when prompted
    useEffect(() => {
        if (!id || typeof window === 'undefined' || !navigator.geolocation) return;
        const stored = getLocation();
        if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
            useLocationRef.current(stored.lat, stored.lng);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) =>
                useLocationRef.current(pos.coords.latitude, pos.coords.longitude),
            () => {
                // Silently fail — user will tap "Use my location" when providers load (required on some mobile browsers)
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
        );
    }, [id]);

    useEffect(() => {
        const img = imageSrc;
        const canStart =
            img &&
            messages.length === 0 &&
            !diagnosis &&
            !hasStartedDiagnosis;
        const shouldStart = canStart && isLoaded;
        if (shouldStart) {
            const userContext =
                directTradeResult
                    ? { trade: directTradeResult.trade, diagnosis: directTradeResult.diagnosis }
                    : directTradeSelection
                      ? { trade: directTradeSelection.trade, diagnosis: directTradeSelection.diagnosis }
                      : undefined;
            startInitialDiagnosis(img, userContext);
        }
    }, [
        id,
        isLoaded,
        imageSrc,
        messages.length,
        diagnosis,
        hasStartedDiagnosis,
        directTradeResult,
        directTradeSelection,
        startInitialDiagnosis,
    ]);

    const handleSend = async (overrideMessage?: string, options?: { diagnosisRejected?: boolean }) => {
        const msgToSend = (overrideMessage ?? message).trim();
        const attachmentsToSend = options?.diagnosisRejected ? [] : pendingAttachments;
        if (!msgToSend && attachmentsToSend.length === 0) return;
        if (isResponding) return;
        if (!imageSrc) {
            toast.error('Please upload an image to diagnose.');
            return;
        }

        const userMsg = msgToSend || 'Sent images';
        const newMessage: Message = {
            role: 'user',
            content: userMsg,
            attachments: attachmentsToSend,
        };

        const previousDiagnosis = diagnosis;
        setMessages((prev) => [...prev, newMessage]);
        if (!overrideMessage) {
            setMessage('');
            setPendingAttachments([]);
        }
        setIsResponding(true);

        saveMessage('user', userMsg, attachmentsToSend);
        setDiagnosis((prev) => (prev ? { ...prev, thinking: '' } : prev));

        try {
            const initialMsgContent = diagnosis
                ? `DIAGNOSIS: ${diagnosis.diagnosis}\n\n${diagnosis.action_required}\n\nESTIMATED COST: ${diagnosis.estimated_cost}`
                : '';

            const history = [
                ...(initialMsgContent
                    ? [{ role: 'assistant' as const, content: initialMsgContent }]
                    : []),
                ...messages,
                newMessage,
            ].map((m) => ({ role: m.role, content: m.content, attachments: m.attachments ?? [] }));

            const providersFromMessages =
                [...messages].reverse().find((m) => m.providers && m.providers.length > 0)?.providers ?? [];
            const userContext =
                directTradeResult
                    ? { trade: directTradeResult.trade, diagnosis: directTradeResult.diagnosis }
                    : directTradeSelection
                      ? { trade: directTradeSelection.trade, diagnosis: directTradeSelection.diagnosis }
                      : undefined;

            const res = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageSrc,
                    history,
                    providers: providersFromMessages,
                    previousDiagnosis: diagnosis
                        ? {
                              diagnosis: diagnosis.diagnosis,
                              trade: diagnosis.trade,
                              action_required: diagnosis.action_required,
                              estimated_cost: diagnosis.estimated_cost,
                          }
                        : null,
                    diagnosisRejected: options?.diagnosisRejected ?? false,
                    ...(userContext && { userSelectedTrade: userContext }),
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                toast.error(error.error || 'Failed to get response');
                setIsResponding(false);
                return;
            }

            if (!res.body) {
                setIsResponding(false);
                return;
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: '', feedback: null }]);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let currentThinking = '';
            let providersFetchedForStream = false;

            while (true) {
                const { done, value } = await reader.read();
                const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                fullText += chunk;

                const thoughtMatch =
                    fullText.match(
                        /<(?:thought|thought_process|thinking)>([\s\S]*?)(?:\s*<\/(?:thought|thought_process|thinking)>|$)/i
                    ) || fullText.match(/```(?:thought|thinking)\s*([\s\S]*?)(?:\s*```|$)/i);

                if (thoughtMatch?.[1]) {
                    currentThinking = cleanThinkingText(thoughtMatch[1]);
                    setDiagnosis((prev) => (prev ? { ...prev, thinking: currentThinking } : prev));
                }

                const jsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                if (jsonMatch) {
                    let cleaned = jsonMatch[1]
                        .trim()
                        .replace(/^```json\s*/i, '')
                        .replace(/```$/i, '')
                        .trim();

                    try {
                        let toParse = cleaned;
                        if (!fullText.toLowerCase().includes('</json>') && !cleaned.endsWith('}')) {
                            const lastBrace = cleaned.lastIndexOf('}');
                            if (lastBrace !== -1) toParse = cleaned.substring(0, lastBrace + 1);
                        }

                        const parsedJson = JSON.parse(toParse);
                        const assistantContent = buildAssistantContent(parsedJson, currentThinking);

                        setMessages((prev) => {
                            const next = [...prev];
                            const last = next[next.length - 1];
                            next[next.length - 1] = {
                                ...last,
                                content: assistantContent,
                                ...(parsedJson.diagnosis
                                    ? {
                                          hasUpdatedDiagnosis:
                                              (previousDiagnosis?.diagnosis || '').trim().toLowerCase() !==
                                                  (parsedJson.diagnosis || '').trim().toLowerCase() ||
                                              (previousDiagnosis?.trade || '').trim().toLowerCase() !==
                                                  (parsedJson.trade || '').trim().toLowerCase(),
                                          diagnosis: { thinking: currentThinking, ...parsedJson },
                                      }
                                    : {}),
                            };
                            return next;
                        });

                        if (parsedJson.diagnosis) {
                            const conf = (parsedJson.confidence as number) ?? 0;
                            const clean = (s: string | undefined) => (s || '').trim().toLowerCase();
                            const hasChanged =
                                clean(previousDiagnosis?.diagnosis) !== clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);
                            const canShowProvs =
                                conf >= 85 &&
                                !parsedJson.requires_clarification &&
                                !parsedJson.rejected &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A';
                            const canFetchEarly =
                                !parsedJson.requires_clarification &&
                                !parsedJson.rejected &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A';

                            if (fullText.toLowerCase().includes('</json>')) {
                                void saveConversation({ diag });
                                saveMessage('assistant', assistantContent, [], hasChanged, diag, undefined);
                            }
                            if (canFetchEarly && !providersFetchedForStream) {
                                providersFetchedForStream = true;
                                const msgIdx = messages.length;
                                const loc = userLocation;
                                const hasLoc =
                                    typeof loc?.lat === 'number' &&
                                    typeof loc?.lng === 'number' &&
                                    !isNaN(loc.lat) &&
                                    !isNaN(loc.lng);
                                if (hasLoc) {
                                    fetchProvidersForMessage(
                                        msgIdx,
                                        parsedJson.trade,
                                        loc.lat,
                                        loc.lng,
                                        assistantContent,
                                        hasChanged,
                                        diag
                                    );
                                } else {
                                    getCurrentLocation({
                                        messageIndex: msgIdx,
                                        trade: parsedJson.trade,
                                        msgContent: assistantContent,
                                        hasUpdatedDiagnosis: hasChanged,
                                        diagnosis: diag,
                                    });
                                }
                            }
                        } else if (fullText.toLowerCase().includes('</json>')) {
                            saveMessage('assistant', assistantContent, [], false);
                        }
                    } catch (e) {
                        const parsed = tryParseDiagnosisJson(fullText) as Record<string, unknown> | null;
                        if (parsed) {
                            const assistantContent = buildAssistantContent(
                                parsed as { message?: string; diagnosis?: string; action_required?: string },
                                currentThinking
                            );
                            const diagObj = parsed as { diagnosis?: string; trade?: string };
                            const fullDiag: DiagnosisData = {
                                thinking: currentThinking,
                                diagnosis: (parsed.diagnosis as string) || '',
                                trade: (parsed.trade as string) || 'N/A',
                                action_required: (parsed.action_required as string) || 'N/A',
                                estimated_cost: (parsed.estimated_cost as string) || 'N/A',
                                ...parsed,
                            };
                            setMessages((prev) => {
                                const next = [...prev];
                                const last = next[next.length - 1];
                                next[next.length - 1] = {
                                    ...last,
                                    content: assistantContent,
                                    ...(diagObj.diagnosis
                                        ? {
                                              hasUpdatedDiagnosis:
                                                  (previousDiagnosis?.diagnosis || '').trim().toLowerCase() !==
                                                      (diagObj.diagnosis || '').trim().toLowerCase() ||
                                                  (previousDiagnosis?.trade || '').trim().toLowerCase() !==
                                                      (diagObj.trade || '').trim().toLowerCase(),
                                              diagnosis: fullDiag,
                                          }
                                        : {}),
                                };
                                return next;
                            });
                            const conf = (parsed.confidence as number) ?? 0;
                            const hasChanged =
                                (previousDiagnosis?.diagnosis || '').trim().toLowerCase() !==
                                    (diagObj.diagnosis || '').trim().toLowerCase() ||
                                (previousDiagnosis?.trade || '').trim().toLowerCase() !==
                                    (diagObj.trade || '').trim().toLowerCase();
                            if (diagObj.diagnosis) {
                                setDiagnosis(fullDiag);
                                const tradeVal = diagObj.trade;
                                const canShowProvs =
                                    conf >= 85 &&
                                    !(parsed.requires_clarification as boolean) &&
                                    !(parsed.rejected as boolean) &&
                                    tradeVal &&
                                    tradeVal !== 'N/A';
                                const msgIdx = messages.length;
                                const loc = userLocation;
                                const hasLoc =
                                    typeof loc?.lat === 'number' &&
                                    typeof loc?.lng === 'number' &&
                                    !isNaN(loc.lat) &&
                                    !isNaN(loc.lng);
                                if (canShowProvs && tradeVal) {
                                    if (hasLoc) {
                                        fetchProvidersForMessage(
                                            msgIdx,
                                            tradeVal,
                                            loc.lat,
                                            loc.lng,
                                            assistantContent,
                                            hasChanged,
                                            fullDiag
                                        );
                                    } else {
                                        getCurrentLocation({
                                            messageIndex: msgIdx,
                                            trade: tradeVal,
                                            msgContent: assistantContent,
                                            hasUpdatedDiagnosis: hasChanged,
                                            diagnosis: fullDiag,
                                        });
                                    }
                                }
                                await saveConversation({ diag: fullDiag });
                                saveMessage('assistant', assistantContent, [], hasChanged, fullDiag, undefined);
                            }
                        }
                    }
                }

                if (done) break;
            }

            // Re-extract thinking from full stream if missed during streaming (e.g. follow-up responses)
            if (!currentThinking.trim() && fullText) {
                const thoughtMatch =
                    fullText.match(
                        /<(?:thought|thought_process|thinking)>([\s\S]*?)(?:\s*<\/(?:thought|thought_process|thinking)>|$)/i
                    ) || fullText.match(/```(?:thought|thinking)\s*([\s\S]*?)(?:\s*```|$)/i);
                if (thoughtMatch?.[1]) {
                    currentThinking = cleanThinkingText(thoughtMatch[1]);
                }
            }

            // Ensure diagnosis.thinking is set if we have it (in case JSON was parsed before thought during stream)
            if (currentThinking.trim()) {
                setDiagnosis((prev) => (prev ? { ...prev, thinking: currentThinking } : prev));
            }

            // Post-stream finalization: parse fullText again in case we missed the JSON during streaming
            const finalParsed = tryParseDiagnosisJson(fullText) as {
                diagnosis?: string;
                trade?: string;
                action_required?: string;
                estimated_cost?: string;
                confidence?: number;
                requires_clarification?: boolean;
                rejected?: boolean;
            } | null;
            if (finalParsed?.diagnosis) {
                let didUpdate = false;
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === 'assistant' && !last.diagnosis) {
                        didUpdate = true;
                        const assistantContent = buildAssistantContent(
                            finalParsed as { message?: string; diagnosis?: string; action_required?: string },
                            currentThinking
                        );
                        const fullDiag: DiagnosisData = {
                            thinking: currentThinking,
                            diagnosis: (finalParsed.diagnosis as string) || '',
                            trade: (finalParsed.trade as string) || 'N/A',
                            action_required: (finalParsed.action_required as string) || 'N/A',
                            estimated_cost: (finalParsed.estimated_cost as string) || 'N/A',
                            ...finalParsed,
                        };
                        next[next.length - 1] = {
                            ...last,
                            content: assistantContent,
                            hasUpdatedDiagnosis:
                                (previousDiagnosis?.diagnosis || '').trim().toLowerCase() !==
                                    (finalParsed.diagnosis || '').trim().toLowerCase() ||
                                (previousDiagnosis?.trade || '').trim().toLowerCase() !==
                                    (finalParsed.trade || '').trim().toLowerCase(),
                            diagnosis: fullDiag,
                        };
                        return next;
                    }
                    return next;
                });
                if (didUpdate && !providersFetchedForStream) {
                    providersFetchedForStream = true;
                    const conf = (finalParsed.confidence as number) ?? 0;
                    const canShowProvs =
                        conf >= 85 &&
                        !finalParsed.requires_clarification &&
                        !finalParsed.rejected &&
                        finalParsed.trade &&
                        finalParsed.trade !== 'N/A';
                    const fullDiag: DiagnosisData = {
                        thinking: currentThinking,
                        diagnosis: (finalParsed.diagnosis as string) || '',
                        trade: (finalParsed.trade as string) || 'N/A',
                        action_required: (finalParsed.action_required as string) || 'N/A',
                        estimated_cost: (finalParsed.estimated_cost as string) || 'N/A',
                        ...finalParsed,
                    };
                    setDiagnosis(fullDiag);
                    await saveConversation({ diag: fullDiag });
                    saveMessage(
                        'assistant',
                        buildAssistantContent(finalParsed, currentThinking),
                        [],
                        false,
                        fullDiag,
                        undefined
                    );
                    const msgIdx = messages.length;
                    const loc = userLocation;
                    const hasLoc =
                        typeof loc?.lat === 'number' &&
                        typeof loc?.lng === 'number' &&
                        !isNaN(loc.lat) &&
                        !isNaN(loc.lng);
                    if (canShowProvs) {
                        if (hasLoc) {
                            fetchProvidersForMessage(
                                msgIdx,
                                finalParsed.trade!,
                                loc.lat,
                                loc.lng,
                                buildAssistantContent(finalParsed, currentThinking),
                                false,
                                fullDiag
                            );
                        } else {
                            if (finalParsed.trade) {
                                getCurrentLocation({
                                    messageIndex: msgIdx,
                                    trade: finalParsed.trade,
                                    msgContent: buildAssistantContent(finalParsed as { message?: string; diagnosis?: string; action_required?: string }, currentThinking),
                                    hasUpdatedDiagnosis: false,
                                    diagnosis: fullDiag,
                                });
                            }
                        }
                    }
                }
            }

            // Fallback: if stream ended but assistant message is still empty, try robust parse
            setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant' && !last.content?.trim() && fullText) {
                    const parsed = tryParseDiagnosisJson(fullText) as {
                        message?: string;
                        diagnosis?: string;
                        action_required?: string;
                    } | null;
                    if (parsed) {
                        const content = buildAssistantContent(parsed, currentThinking);
                        next[next.length - 1] = { ...last, content };
                    } else {
                        const extracted = extractMessageFromRaw(fullText);
                        next[next.length - 1] = {
                            ...last,
                            content: extracted || "I'm sorry, I had trouble processing that. Please try again.",
                        };
                    }
                }
                return next;
            });
        } catch (err) {
            console.error('Follow-up failed:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to get response. Please try again.');
        } finally {
            setIsResponding(false);
        }
    };

    const handleMessageFeedback = (index: number, type: 'up' | 'down') => {
        setMessages((prev) =>
            prev.map((msg, i) =>
                i === index ? { ...msg, feedback: msg.feedback === type ? null : type } : msg
            )
        );
    };

    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content);
    };

    const handleRegenerate = async (index: number) => {
        const messageHistory = messages.slice(0, index);
        const lastUserMsg = [...messageHistory].reverse().find((m) => m.role === 'user');

        if (!lastUserMsg) return;

        const previousDiagnosis = diagnosis;
        setMessages((prev) => prev.slice(0, index));
        setIsResponding(true);

        try {
            const initialMsgContent = diagnosis
                ? `DIAGNOSIS: ${diagnosis.diagnosis}\n\n${diagnosis.action_required}\n\nESTIMATED COST: ${diagnosis.estimated_cost}`
                : '';

            const history = [
                ...(initialMsgContent
                    ? [{ role: 'assistant' as const, content: initialMsgContent }]
                    : []),
                ...messageHistory,
            ].map((m) => ({ role: m.role, content: m.content, attachments: m.attachments ?? [] }));

            const providersFromRegenerate =
                [...messageHistory].reverse().find((m) => m.providers && m.providers.length > 0)?.providers ?? [];
            const res = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageSrc,
                    history,
                    providers: providersFromRegenerate,
                    previousDiagnosis: diagnosis
                        ? {
                              diagnosis: diagnosis.diagnosis,
                              trade: diagnosis.trade,
                              action_required: diagnosis.action_required,
                              estimated_cost: diagnosis.estimated_cost,
                          }
                        : null,
                }),
            });

            if (!res.ok) {
                toast.error((await res.json()).error || 'Failed to regenerate');
                setIsResponding(false);
                return;
            }

            if (!res.body) {
                setIsResponding(false);
                return;
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: '', feedback: null }]);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let currentThinking = '';

            while (true) {
                const { done, value } = await reader.read();
                const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                fullText += chunk;

                const thoughtMatch = fullText.match(
                    /<(?:thought|thought_process|thinking)>([\s\S]*?)(?:\s*<\/(?:thought|thought_process|thinking)>|$)/i
                );
                if (thoughtMatch?.[1]) {
                    currentThinking = cleanThinkingText(thoughtMatch[1]);
                    setDiagnosis((prev) =>
                        prev
                            ? { ...prev, thinking: currentThinking }
                            : {
                                  thinking: currentThinking,
                                  diagnosis: '',
                                  trade: '',
                                  action_required: '',
                                  estimated_cost: '',
                                  message: '',
                              }
                    );
                }

                const jsonMatch = fullText.match(
                    /<(?:json|diagnosis_data)>([\s\S]*?)(?:\s*<\/(?:json|diagnosis_data)>|$)/i
                );
                if (jsonMatch) {
                    let cleaned = jsonMatch[1]
                        .trim()
                        .replace(/^```json\s*/i, '')
                        .replace(/```$/i, '')
                        .trim();
                    try {
                        let toParse = cleaned;
                        const isComplete =
                            fullText.toLowerCase().includes('</json>') ||
                            fullText.toLowerCase().includes('</diagnosis_data>');
                        if (!isComplete && !cleaned.endsWith('}')) {
                            const lastBrace = cleaned.lastIndexOf('}');
                            if (lastBrace !== -1) toParse = cleaned.substring(0, lastBrace + 1);
                        }

                        const parsedJson = JSON.parse(toParse);
                        const assistantContent = buildAssistantContent(parsedJson, currentThinking);

                        setMessages((prev) => {
                            const next = [...prev];
                            const last = next[next.length - 1];
                            next[next.length - 1] = {
                                ...last,
                                content: assistantContent,
                                ...(parsedJson.diagnosis
                                    ? {
                                          hasUpdatedDiagnosis:
                                              (previousDiagnosis?.diagnosis || '').trim().toLowerCase() !==
                                                  (parsedJson.diagnosis || '').trim().toLowerCase() ||
                                              (previousDiagnosis?.trade || '').trim().toLowerCase() !==
                                                  (parsedJson.trade || '').trim().toLowerCase(),
                                          diagnosis: { thinking: currentThinking, ...parsedJson },
                                      }
                                    : {}),
                            };
                            return next;
                        });

                        if (parsedJson.diagnosis) {
                            const conf = (parsedJson.confidence as number) ?? 0;
                            const clean = (s: string | undefined) => (s || '').trim().toLowerCase();
                            const hasChanged =
                                clean(previousDiagnosis?.diagnosis) !== clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);
                            if (isComplete) {
                                await saveConversation({ diag });
                                saveMessage('assistant', assistantContent, [], hasChanged, diag, undefined);
                                const canShowProvs =
                                    conf >= 85 &&
                                    !parsedJson.requires_clarification &&
                                    !parsedJson.rejected &&
                                    parsedJson.trade &&
                                    parsedJson.trade !== 'N/A';
                                const msgIdx = index;
                                const loc = userLocation;
                                const hasLoc =
                                    typeof loc?.lat === 'number' &&
                                    typeof loc?.lng === 'number' &&
                                    !isNaN(loc.lat) &&
                                    !isNaN(loc.lng);
                                if (canShowProvs && hasLoc) {
                                    fetchProvidersForMessage(
                                        msgIdx,
                                        parsedJson.trade,
                                        loc.lat,
                                        loc.lng,
                                        assistantContent,
                                        hasChanged,
                                        diag
                                    );
                                }
                            }
                        } else if (isComplete) {
                            saveMessage('assistant', assistantContent, [], false);
                        }
                    } catch (e) {
                        console.warn('Regenerate JSON parse failed:', (e as Error).message);
                    }
                }

                if (done) break;
            }

            // Fallback for regenerate: if assistant message still empty
            setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant' && !last.content?.trim() && fullText) {
                    const parsed = tryParseDiagnosisJson(fullText) as {
                        message?: string;
                        diagnosis?: string;
                        action_required?: string;
                    } | null;
                    if (parsed) {
                        const content = buildAssistantContent(parsed, currentThinking);
                        next[next.length - 1] = { ...last, content };
                    } else {
                        const extracted = extractMessageFromRaw(fullText);
                        next[next.length - 1] = {
                            ...last,
                            content: extracted || "I'm sorry, I had trouble processing that. Please try again.",
                        };
                    }
                }
                return next;
            });
        } catch (err) {
            console.error('Regeneration failed:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to regenerate. Please try again.');
        } finally {
            setIsResponding(false);
        }
    };

    // --- Render ---

    // Use store image immediately so we never block on loading when coming from home page
    const displayImage = imageSrc;
    const showThinking =
        isDiagnosing || isResponding || ((displayImage || messages.length > 0) && !diagnosis?.diagnosis);

    if (!id) {
        router.replace('/');
        return null;
    }

    // Only show spinner when we truly have no image (not from state or store)
    if (!isLoaded && !displayImage) {
        return (
            <div className="flex flex-1 flex-col">
                <AppHeader isLoading />
                <div className="flex flex-1 items-center justify-center">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            </div>
        );
    }

    const directTrade = directTradeResult || directTradeSelection;
    const hasServiceChoice = !!directTradeSelection;
    const trade = directTradeSelection?.trade ?? directTrade?.trade;
    const serviceLabel =
        trade === 'Electrician'
            ? 'electrical assistance'
            : trade === 'Plumber'
              ? 'plumbing assistance'
              : trade === 'Gate Repair'
                ? 'gate repair'
                : trade === 'Roofing'
                  ? 'roofing assistance'
                  : trade
                    ? trade.toLowerCase()
                    : '';

    const headerTitle =
        diagnosis?.diagnosis ||
        (directTrade?.diagnosis ?? 'New Diagnosis');

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <AppHeader title={headerTitle} imageSrc={displayImage} scrolled={headerScrolled} />

            <main
                ref={mainRef}
                style={{ paddingBottom: footerHeight }}
                className="flex flex-1 overflow-y-auto"
                onScroll={() => setHeaderScrolled((mainRef.current?.scrollTop ?? 0) > 0)}
            >
                <div className="max-w-4xl mx-auto w-full px-4 py-4 flex flex-col gap-6">
                    {/* Provider results - when direct trade with providers */}
                    {(directTradeResult || (directTradeSelection && isLoadingDirectProviders)) && (
                        <div className="rounded-lg border border-border p-4">
                            <DiagnosisResponseCard
                                conversationId={id}
                                diagnosis={{
                                    thinking: '',
                                    diagnosis: (directTradeResult || directTradeSelection)!.diagnosis,
                                    trade: (directTradeResult || directTradeSelection)!.trade,
                                    action_required: '',
                                    estimated_cost: '',
                                    confidence: 100,
                                }}
                                providers={directTradeResult?.providers ?? []}
                                isLoadingProviders={isLoadingDirectProviders}
                                userLocation={userLocation}
                                onRequestLocation={() =>
                                    getCurrentLocation({
                                        directTrade: {
                                            trade: (directTradeResult || directTradeSelection)!.trade,
                                            diagnosis: (directTradeResult || directTradeSelection)!.diagnosis,
                                        },
                                    })
                                }
                                onAddressSelect={(loc) => {
                                    setUserLocation(loc);
                                    setIsLoadingDirectProviders(true);
                                    const dt = directTradeResult || directTradeSelection;
                                    if (dt) fetchDirectProviders(dt.trade, loc.lat, loc.lng, dt.diagnosis);
                                }}
                                onConfirmYes={undefined}
                                onConfirmNo={undefined}
                                diagnosisConfirmed={true}
                                trade={(directTradeResult || directTradeSelection)!.trade}
                                openPopoverId={openPopoverId}
                                setOpenPopoverId={setOpenPopoverId}
                            />
                        </div>
                    )}

                    {/* Diagnosis thinking - tight gap to diagnosis header */}
                    <div className="flex flex-col gap-2">
                        {(showThinking || (diagnosis?.thinking && !diagnosis?.requires_clarification)) && (
                            <blockquote className="border-l-2 border-input pl-3">
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                    {diagnosis?.thinking ? thinkingForDisplay(diagnosis.thinking) : 'Analysing…'}
                                </p>
                            </blockquote>
                        )}
                        <div className="flex flex-col gap-4 [&>*:first-child]:!mt-0">
                        {messages.map((msg, i) => (
                            <ChatMessage
                                key={i}
                                message={msg}
                                index={i}
                                isLast={i === messages.length - 1}
                                isResponding={isResponding}
                                onFeedback={(type) => handleMessageFeedback(i, type)}
                                onCopy={() => handleCopy(msg.content)}
                                onRegenerate={() => handleRegenerate(i)}
                                inlineDiagnosisProps={
                                    msg.role === 'assistant' && msg.diagnosis
                                        ? {
                                              conversationId: id,
                                              userLocation,
                                              isLoadingProviders: isLoadingProvidersForMessage === i,
                                              openPopoverId,
                                              setOpenPopoverId,
                                              onRequestLocation: () =>
                                                  getCurrentLocation({
                                                      messageIndex: i,
                                                      trade: msg.diagnosis!.trade,
                                                      msgContent: msg.content,
                                                      hasUpdatedDiagnosis: msg.hasUpdatedDiagnosis ?? false,
                                                      diagnosis: msg.diagnosis!,
                                                  }),
                                              onAddressSelect: (loc) => {
                                                  setUserLocation(loc);
                                                  saveConversation({ loc });
                                                  fetchProvidersForMessage(
                                                      i,
                                                      msg.diagnosis!.trade ?? '',
                                                      loc.lat,
                                                      loc.lng,
                                                      msg.content,
                                                      msg.hasUpdatedDiagnosis ?? false,
                                                      msg.diagnosis!
                                                  );
                                              },
                                          }
                                        : undefined
                                }
                            />
                        ))}
                        <div ref={messagesEndRef} />
                        </div>
                    </div>
                </div>
            </main>

            <ChatFooter
                ref={footerRef}
                message={message}
                setMessage={setMessage}
                handleSend={handleSend}
                isDiagnosing={isDiagnosing}
                isResponding={isResponding}
                hasDiagnosis={!!diagnosis || !!directTradeResult}
                pendingAttachments={displayImage ? pendingAttachments : []}
                onAddAttachments={
                    displayImage
                        ? async (files) => {
                              const remaining = 5 - pendingAttachments.length;
                              const toAdd = files.slice(0, remaining);
                              const dataUrls: string[] = [];
                              for (const file of toAdd) {
                                  try {
                                      const url = await new Promise<string>((resolve, reject) => {
                                          const r = new FileReader();
                                          r.onload = () => resolve(r.result as string);
                                          r.onerror = reject;
                                          r.readAsDataURL(file);
                                      });
                                      const compressed = await compressImage(url);
                                      dataUrls.push(compressed);
                                  } catch (e) {
                                      console.error('Failed to process image:', e);
                                  }
                              }
                              if (dataUrls.length > 0) {
                                  setPendingAttachments((prev) => [...prev, ...dataUrls].slice(0, 5));
                              }
                          }
                        : async (files) => {
                              const file = files.find(
                                                  (f) =>
                                                      f.type.startsWith('image/') ||
                                                      f.type.startsWith('video/')
                                              );
                              if (file) handleWelcomeUpload(file);
                          }
                }
                onRemoveAttachment={
                    displayImage
                        ? (i) => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))
                        : () => {}
                }
                welcomeMode={!displayImage}
                inputRef={welcomeFileInputRef}
            />
        </div>
    );
}
