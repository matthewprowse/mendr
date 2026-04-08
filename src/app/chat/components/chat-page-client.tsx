/**
 * Client Component: The interactive chat UI for AI image diagnosis and provider discovery.
 * Receives conversationId from the Server Component page wrapper.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { getLocation, clearLocation } from '@/lib/location-store';
import { getImageData, clearImageData } from '@/lib/image-store';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';
import { openInNewTab } from '@/lib/open-in-new-tab';
import { toast } from 'sonner';

import { sanitizeAiContent, tryParseDiagnosisJson, extractMessageFromRaw } from '@/lib/utils';
import { tradeToServiceLabel } from '@/lib/services';
import type { ServiceLabel } from '@/lib/service-icons';
import { logScandioEvent } from '@/lib/audit-log';
import { useAuth } from '@/context/auth-context';
import { DiagnosisData, Message, Provider } from './types';
import { ChatMessage } from './chat-message';
import { ChatFooter } from './chat-footer';
import { DiagnosisResponseCard } from './diagnosis-response-card';
import { ChatPageImageSkeleton, ChatPageTradeSkeleton } from './skeletons';

export interface ChatPageClientProps {
    conversationId: string;
    initialTrade?: string;
}

export function ChatPageClient({ conversationId, initialTrade }: ChatPageClientProps) {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const id = conversationId;

    // Don't read store during render to avoid hydration mismatch (server has no store; client might).
    // Store is applied in useEffect so first paint matches server.
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);
    const [initialImageDescription, setInitialImageDescription] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [hasStartedDiagnosis, setHasStartedDiagnosis] = useState(false);
    const diagnosisStartedRef = useRef(false);
    const [isResponding, setIsResponding] = useState(false);
    const [isLoadingProvidersForMessage, setIsLoadingProvidersForMessage] = useState<number | null>(
        null
    );
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
        emergingProviders?: Provider[];
        nearbyOnlyProviders?: Provider[];
    } | null>(null);
    const [isLoadingDirectProviders, setIsLoadingDirectProviders] = useState(false);
    const [providerRadiusKm, setProviderRadiusKm] = useState(25);
    const [welcomeSelectedService, setWelcomeSelectedService] = useState<ServiceLabel | null>(null);

    // Use stored image immediately so we never block on loading when coming from home page
    const displayImage = imageSrc;
    const displayImageHref = imagePublicUrl || imageSrc;
    // --- Refs ---

    // Pre-select service when coming from URL with trade (e.g. /chat/xxx?trade=Plumbing)
    useEffect(() => {
        if (initialTrade?.trim() && isLoaded && !displayImage) {
            const canonical = tradeToServiceLabel(initialTrade);
            if (canonical) {
                setWelcomeSelectedService(canonical as ServiceLabel);
            }
        }
    }, [initialTrade, isLoaded, displayImage]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const welcomeFileInputRef = useRef<HTMLInputElement>(null);

    const startInitialDiagnosisAbortRef = useRef<AbortController | null>(null);

    const handleWelcomeUpload = async (file: File) => {
        if (!file || !id) return;
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) return;
        if (welcomeSelectedService) {
            setDirectTradeSelection({ trade: welcomeSelectedService, diagnosis: '' });
        }
        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const finalDataUrl = isImage ? await compressImage(base64) : base64;
                setImageSrc(finalDataUrl);
                setImagePublicUrl(null);
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
                        supabase.from('diagnoses').select('*').eq('id', id),
                        supabase
                            .from('messages')
                            .select('*')
                            .eq('conversation_id', id)
                            .order('created_at', { ascending: true }),
                    ]);

                if (convResult.error) throw convResult.error;
                if (msgsResult.error) throw msgsResult.error;

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
                    if (conv.initial_image_description)
                        setInitialImageDescription(conv.initial_image_description);
                    if (conv.diagnosis) setDiagnosis(conv.diagnosis);
                    if (conv.customer_lat && conv.customer_lng) {
                        setUserLocation({
                            lat: conv.customer_lat,
                            lng: conv.customer_lng,
                            address: conv.customer_address || '',
                        });
                    }
                }
                if (getCancelled?.()) return null;

                if (msgs && msgs.length > 0) {
                    const mappedMsgs = msgs.map((m: any) => {
                        const rawAtt = m.attachments || [];
                        const attachments = Array.isArray(rawAtt)
                            ? rawAtt
                                  .map((a: unknown) =>
                                      typeof a === 'string'
                                          ? a
                                          : a && typeof a === 'object' && 'url' in a
                                            ? (a as { url: string }).url
                                            : null
                                  )
                                  .filter((x: unknown): x is string => typeof x === 'string')
                            : [];
                        const rawContent = m.content;
                        const content =
                            typeof rawContent === 'string'
                                ? rawContent
                                : rawContent != null
                                  ? String(rawContent)
                                  : '';
                        // DB columns are snake_case; support both for robustness. Normalise to arrays so stored providers render when reopening.
                        const rawProviders = m.providers ?? m['providers'];
                        const rawEmerging = m.emerging_providers ?? m['emerging_providers'];
                        const rawNearby = (m as { nearby_only_providers?: unknown })['nearby_only_providers'];
                        const providersMapped = Array.isArray(rawProviders) ? rawProviders : (rawProviders != null ? [] : undefined);
                        const emergingMapped = Array.isArray(rawEmerging) ? rawEmerging : (rawEmerging != null ? [] : undefined);
                        const nearbyMapped = Array.isArray(rawNearby) ? rawNearby : (rawNearby != null ? [] : undefined);
                        return {
                            role: m.role as 'user' | 'assistant',
                            content: content === '[object Object]' ? '' : content,
                            attachments,
                            attachment_descriptions: (m.attachment_descriptions as string[] | undefined) ?? undefined,
                            feedback: m.feedback as 'up' | 'down' | null,
                            hasUpdatedDiagnosis: m.diagnosis_updated,
                            diagnosis: m.diagnosis ?? undefined,
                            providers: providersMapped,
                            emergingProviders: emergingMapped,
                            nearbyOnlyProviders: nearbyMapped,
                        };
                    });
                    setMessages(mappedMsgs);
                    return { msgs: mappedMsgs, loadedConvWithImage: !!conv?.image_url };
                }
                return { msgs: null, loadedConvWithImage: !!conv?.image_url };
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
        providersJson?: Provider[] | null,
        attachment_descriptions?: string[]
    ): Promise<{ id: string } | undefined> => {
        if (!id) return undefined;
        const { data, error } = await (supabase as any)
            .from('messages')
            .insert({
                conversation_id: id,
                role,
                content,
                attachments,
                diagnosis_updated: hasUpdatedDiagnosis,
                diagnosis: diagnosisJson ?? undefined,
                providers: providersJson ?? undefined,
                attachment_descriptions: attachment_descriptions ?? undefined,
            })
            .select('id')
            .single();
        if (error && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.warn('[Supabase] message:', error.code, error.message);
        }
        return data ? { id: data.id } : undefined;
    };

    const updateMessageAttachmentDescriptions = async (
        messageId: string,
        attachment_descriptions: string[]
    ) => {
        if (!id) return;
        await (supabase as any)
            .from('messages')
            .update({ attachment_descriptions })
            .eq('id', messageId)
            .eq('conversation_id', id);
    };

    const saveConversation = async (overrides?: {
        diag?: DiagnosisData;
        loc?: { lat: number; lng: number; address: string };
        initial_image_description?: string;
    }) => {
        if (!id) return;

        const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        const finalDiagnosis = overrides?.diag || diagnosis;
        const finalLocation = overrides?.loc || userLocation;

        const payload: Record<string, unknown> = {
            id,
            title: finalDiagnosis?.diagnosis || 'New Diagnosis',
            image_url: imageSrc,
            customer_lat: finalLocation?.lat,
            customer_lng: finalLocation?.lng,
            customer_address: finalLocation?.address,
            diagnosis: finalDiagnosis,
            device: deviceType,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
            ...(overrides?.initial_image_description !== undefined && {
                initial_image_description: overrides.initial_image_description,
            }),
        };

        // When running without login, we still rely on Supabase anonymous auth
        // so RLS can use `auth.uid()`. Never overwrite `user_id` with null.
        if (user?.id) {
            payload.user_id = user.id;
        }

        const { error } = await (supabase as any).from('diagnoses').upsert(payload);
        if (error && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.warn('[Supabase] conversation:', error.code, error.message);
        } else if (!error) {
            void logScandioEvent(supabase as any, {
                action: 'CONVERSATION_SAVED',
                type: 'DIAGNOSTIC',
                entityId: id,
                entityType: 'diagnoses',
                payload: { has_diagnosis: !!finalDiagnosis },
            });
        }
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const updateMessageProviders = useCallback(
        async (
            messageIndex: number,
            providers: Provider[],
            emergingProviders?: Provider[],
            nearbyOnlyProviders?: Provider[]
        ) => {
            if (!id) return;
            try {
                const { data: all } = await (supabase as any)
                    .from('messages')
                    .select('id')
                    .eq('conversation_id', id)
                    .order('created_at', { ascending: true });
                const targetId = all?.[messageIndex]?.id;
                if (targetId) {
                    const payload: Record<string, unknown> = {
                        providers,
                        emerging_providers: emergingProviders ?? null,
                    };
                    if (nearbyOnlyProviders != null) payload.nearby_only_providers = nearbyOnlyProviders;
                    await (supabase as any).from('messages').update(payload).eq('id', targetId);
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development')
                    console.warn('[Supabase] updateMessageProviders:', e);
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
                        .update({ content, diagnosis })
                        .eq('id', targetId);
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development')
                    console.warn('[Supabase] updateMessageContent:', e);
            }
        },
        [id]
    );

    const fetchProvidersForMessage = useCallback(
        async (
            messageIndex: number,
            trade: string,
            lat: number,
            lng: number,
            msgContent: string,
            hasUpdatedDiag: boolean,
            diag: DiagnosisData,
            opts?: { pageToken?: string; searchQuery?: string; radiusKm?: number }
        ) => {
            const validCoords =
                typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
            if (!trade || trade === 'N/A' || !validCoords) return;
            if (opts?.pageToken && !opts?.searchQuery) {
                console.warn('searchQuery required when using pageToken');
                return;
            }

            setIsLoadingProvidersForMessage(messageIndex);
            try {
                const radiusKm = opts?.radiusKm ?? providerRadiusKm;
                const body: Record<string, unknown> = { lat, lng, trade, radius: radiusKm * 1000 };
                if (opts?.pageToken) body.pageToken = opts.pageToken;
                if (opts?.searchQuery) body.searchQuery = opts.searchQuery;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000);
                const res = await fetch('/api/providers', {
                    signal: controller.signal,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (res.ok) {
                    const finalProviders = (Array.isArray(data.providers) ? data.providers : []) as Provider[];
                    const finalEmerging = (Array.isArray(data.emergingProviders) ? data.emergingProviders : []) as Provider[];
                    const finalNearbyOnly = (Array.isArray(data.nearbyOnlyProviders) ? data.nearbyOnlyProviders : []) as Provider[];

                    setMessages((prev) => {
                        const next = [...prev];
                        const msg = next[messageIndex];
                        if (msg && msg.role === 'assistant') {
                            next[messageIndex] = {
                                ...msg,
                                providers: finalProviders,
                                emergingProviders: finalEmerging,
                                nearbyOnlyProviders: finalNearbyOnly,
                                providerNextPageToken: data.nextPageToken ?? null,
                                providerSearchQuery:
                                    data.searchQuery ?? msg.providerSearchQuery ?? trade,
                            };
                        }
                        return next;
                    });
                    updateMessageProviders(messageIndex, finalProviders, finalEmerging, finalNearbyOnly);
                } else {
                    console.error('API Error:', data.error || 'Unknown error');
                    toast.error(
                        data.error || 'Couldn\'t load providers. Try "Use my location" again.'
                    );
                }
            } catch (err) {
                console.error('Failed to fetch providers:', err);
                const isTimeout = err instanceof Error && err.name === 'AbortError';
                toast.error(
                    isTimeout
                        ? "Providers are taking too long. Try again or use a smaller search radius."
                        : "Couldn't load providers. Check your connection and try again."
                );
            } finally {
                setIsLoadingProvidersForMessage(null);
            }
        },
        [updateMessageProviders, providerRadiusKm]
    );

    const fetchDirectProviders = useCallback(
        async (trade: string, lat: number, lng: number, diagnosis: string, radiusKm?: number) => {
            const validCoords =
                typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
            if (!trade || trade === 'N/A' || !validCoords) return;
            setIsLoadingDirectProviders(true);
            try {
                const radius = (radiusKm ?? providerRadiusKm) * 1000;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000);
                const res = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, trade, radius }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (res.ok && data.providers) {
                    const providers = data.providers as Provider[];
                    const emergingProviders = (data.emergingProviders ?? []) as Provider[];
                    const nearbyOnlyProviders = (data.nearbyOnlyProviders ?? []) as Provider[];
                    setDirectTradeResult({
                        trade,
                        diagnosis,
                        providers,
                        emergingProviders,
                        nearbyOnlyProviders,
                    });
                    setDirectTradeSelection(null);
                } else {
                    setDirectTradeResult({
                        trade,
                        diagnosis,
                        providers: [],
                        emergingProviders: [],
                        nearbyOnlyProviders: [],
                    });
                    setDirectTradeSelection(null);
                }
            } catch (err) {
                const isTimeout = err instanceof Error && err.name === 'AbortError';
                if (isTimeout) toast.error("Providers are taking too long. Try again or use a smaller search radius.");
                setDirectTradeResult({
                    trade,
                    diagnosis,
                    providers: [],
                    emergingProviders: [],
                    nearbyOnlyProviders: [],
                });
                setDirectTradeSelection(null);
            } finally {
                setIsLoadingDirectProviders(false);
            }
        },
        [providerRadiusKm]
    );

    const locationAndFetchProviders = useCallback(
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
            const radius = (providerRadiusKm ?? 25) * 1000;
            const trade =
                opts?.directTrade?.trade ?? opts?.trade ?? null;
            const shouldFetchProviders = Boolean(
                trade && trade !== 'N/A' && (opts?.directTrade || (opts?.messageIndex != null && opts?.trade))
            );

            // Run geocode and provider fetch in parallel so we don't wait for geocode before starting providers
            const geocodePromise = fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng }),
            }).then(async (r) => ({ res: r, data: await r.json().catch(() => ({})) }));

            const providerController = shouldFetchProviders ? new AbortController() : null;
            if (providerController) {
                setTimeout(() => providerController.abort(), 90000);
            }
            const providerPromise = shouldFetchProviders
                ? fetch('/api/providers', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lat, lng, trade, radius }),
                      signal: providerController!.signal,
                  }).then(async (r) => ({ res: r, data: await r.json().catch(() => ({})) }))
                : Promise.resolve(null);

            const [geocodeResult, providerResult] = await Promise.all([geocodePromise, providerPromise]);

            try {
                if (!geocodeResult!.res.ok) {
                    toast.error(
                        (geocodeResult!.data as { error?: string }).error ||
                            'Location must be in Western Cape, South Africa'
                    );
                    if (opts?.messageIndex != null) setIsLoadingProvidersForMessage(null);
                    return;
                }
                const address = (geocodeResult!.data as { address?: string }).address || 'Current Location';
                const loc = { lat, lng, address };
                setUserLocation(loc);
                saveConversation({ loc });
                clearLocation();

                if (providerResult && providerResult.res.ok && providerResult.data.providers != null) {
                    const finalProviders = providerResult.data.providers as Provider[];
                    const finalEmerging = (providerResult.data.emergingProviders ?? []) as Provider[];
                    const finalNearbyOnly = (providerResult.data.nearbyOnlyProviders ?? []) as Provider[];
                    if (opts?.directTrade) {
                        setDirectTradeResult({
                            trade: opts.directTrade.trade,
                            diagnosis: opts.directTrade.diagnosis,
                            providers: finalProviders,
                            emergingProviders: finalEmerging,
                            nearbyOnlyProviders: finalNearbyOnly,
                        });
                        setDirectTradeSelection(null);
                    } else if (opts?.messageIndex != null && opts?.trade) {
                        const msg = messages[opts.messageIndex];
                        const msgContent = msg?.content ?? opts.msgContent ?? '';
                        const diag = msg?.diagnosis ?? opts.diagnosis;
                        if (diag && (msg?.role === 'assistant' || opts.msgContent != null)) {
                            setMessages((prev) => {
                                const next = [...prev];
                                const m = next[opts.messageIndex!];
                                if (m && m.role === 'assistant') {
                                    next[opts.messageIndex!] = {
                                        ...m,
                                        providers: finalProviders,
                                        emergingProviders: finalEmerging,
                                        nearbyOnlyProviders: finalNearbyOnly,
                                        providerNextPageToken:
                                            providerResult.data.nextPageToken ?? null,
                                        providerSearchQuery:
                                            providerResult.data.searchQuery ?? m.providerSearchQuery ?? opts.trade,
                                    };
                                }
                                return next;
                            });
                            updateMessageProviders(
                                opts.messageIndex,
                                finalProviders,
                                finalEmerging,
                                finalNearbyOnly
                            );
                        }
                    }
                    if (opts?.messageIndex != null) setIsLoadingProvidersForMessage(null);
                } else {
                    if (providerResult && !providerResult.res.ok) {
                        const err = (providerResult.data as { error?: string }).error;
                        toast.error(err || "Couldn't load providers. Try 'Use my location' again.");
                    }
                    if (opts?.messageIndex != null) setIsLoadingProvidersForMessage(null);
                }
            } catch (e) {
                console.error('Error getting location:', e);
                toast.error(
                    'Could not verify location. Please try searching for an address in Western Cape.'
                );
                if (opts?.messageIndex != null) setIsLoadingProvidersForMessage(null);
            }
        },
        [saveConversation, messages, updateMessageProviders, providerRadiusKm]
    );

    const cleanThinkingText = useCallback(
        (s: string) =>
            s
                .replace(/<\/?(?:thought|thought_process|thinking)>/gi, '')
                .replace(/```(?:thought|thinking)/gi, '')
                .replace(/\s*```(?:json)?\s*$/gi, '')
                .replace(/^\s*```(?:json)?\s*/gi, '')
                .replace(/```/g, '')
                .replace(/[ \t]+/g, ' ')
                .trim(),
        []
    );

    /** Strip confidence/percentage from thinking for display (e.g. "Confidence: 85%", "95%", "I am 85% confident"). */
    const thinkingForDisplay = useCallback((s: string | undefined) => {
        if (!s?.trim()) return s ?? '';
        return s
            .split(/\n/)
            .map((line) =>
                line
                    // Phrase patterns (confidence-related)
                    .replace(/\s*(?:Confidence|I am|I'm)\s*:?\s*\d+\s*%?\s*confident\.?\s*/gi, '')
                    .replace(/\s*\d+\s*%\s*(?:confident|sure|certain|likely)\s*[.:]?\s*/gi, '')
                    .replace(/\s*Confidence\s*:?\s*\d+\s*%?\s*\.?\s*/gi, '')
                    .replace(/\s*\(\s*\d+\s*%\s*(?:confident)?\s*\)\s*/gi, '')
                    // Standalone percentage at end of line
                    .replace(/\s*[.,;:\s]+\d+\s*%\s*\.?\s*$/g, '')
                    .replace(/\s*\d+\s*%\s*\.?\s*$/g, '')
                    // Percentage at start of line
                    .replace(/^\s*\d+\s*%\s*[.\-\s]*/g, '')
                    // Inline "... 85%." or "... 85%,"
                    .replace(/\s+\d+\s*%\s*[.,;]\s*/g, ' ')
                    .replace(/\s*[.,]\s*\d+\s*%\s*/g, ' ')
                    .trim()
            )
            .filter((line) => line.length > 0)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }, []);

    /** Build chat message content, stripping any thought/reasoning the AI mistakenly put in the message field. */
    const buildAssistantContent = useCallback(
        (
            parsedJson: { message?: string; diagnosis?: string; action_required?: string },
            currentThinking: string
        ) => {
            const fallback =
                (parsedJson.diagnosis || '') + '\n\n' + (parsedJson.action_required || '');
            let content = parsedJson.message || fallback;
            const thought = (currentThinking || '').trim();
            if (thought.length > 15 && content.includes(thought)) {
                content = content
                    .replace(thought, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
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
                    if (opts?.messageIndex != null) setIsLoadingProvidersForMessage(null);
                    if (err.code === 1) {
                        toast.error(
                            "Location was denied. Tap your browser's lock/info icon next to the address bar and allow location for this site, then try again."
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
                locationAndFetchProviders(stored.lat, stored.lng, {
                    directTrade,
                });
                return;
            }
            if (hasLoc) {
                locationAndFetchProviders(userLocation!.lat, userLocation!.lng, {
                    directTrade,
                });
                return;
            }
            getCurrentLocation({ directTrade });
        },
        [userLocation, locationAndFetchProviders, getCurrentLocation]
    );

    // When user clicks "Start Diagnosis" on the in-chat welcome service cards,
    // mirror the marketing "Our Services" behaviour: immediately fetch providers
    // for that trade, show them, and ask the user to upload an image to generate the report.
    const handleWelcomeStartDiagnosis = useCallback(
        (trade: ServiceLabel, diagnosis: string) => {
            setDirectTradeResult(null);
            setDirectTradeSelection({ trade, diagnosis });
            handleGetCompaniesNow({ trade, diagnosis });
        },
        [handleGetCompaniesNow]
    );

    const initialTradeAppliedRef = useRef(false);
    useEffect(() => {
        if (!initialTrade?.trim() || !isLoaded || initialTradeAppliedRef.current) return;
        const canonicalTrade = tradeToServiceLabel(initialTrade);
        if (!canonicalTrade) return;
        if (imageSrc || directTradeResult) return;
        initialTradeAppliedRef.current = true;
        const diagnosis = `${canonicalTrade} services`;
        setDirectTradeSelection({ trade: canonicalTrade, diagnosis });
        handleGetCompaniesNow({ trade: canonicalTrade, diagnosis });
    }, [
        initialTrade,
        isLoaded,
        imageSrc,
        directTradeResult,
        handleGetCompaniesNow,
    ]);

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

                const storedImageUrl = res.headers.get('X-Image-Url');
                if (storedImageUrl) {
                    setImageSrc(storedImageUrl);
                    setImagePublicUrl(storedImageUrl);
                    // Persist so reloads use the Supabase URL (not data:/blob).
                    if (id) {
                        void (supabase as any)
                            .from('diagnoses')
                            .update({ image_url: storedImageUrl })
                            .eq('id', id);
                    }
                }

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
                            const finalJsonMatch = fullText.match(
                                /<json>([\s\S]*?)(?:<\/json>|$)/i
                            );
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
                    const thoughtOpen = fullText.search(
                        /<(?:thought|thought_process|thinking)\s*>/i
                    );
                    if (thoughtOpen !== -1) {
                        const afterOpen = fullText
                            .slice(thoughtOpen)
                            .replace(/^<(?:thought|thought_process|thinking)\s*>/i, '');
                        const endClose = afterOpen.search(
                            /<\/(?:thought|thought_process|thinking)\s*>/i
                        );
                        const endJson = afterOpen.search(/<json\s*>/i);
                        const end = [endClose, endJson].filter((i) => i >= 0).length
                            ? Math.min(...[endClose, endJson].filter((i) => i >= 0))
                            : undefined;
                        const raw = (
                            end !== undefined ? afterOpen.slice(0, end) : afterOpen
                        ).trim();
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
                                thinking:
                                    thinking && thinking.trim() ? thinking : prev?.thinking || '',
                            }));

                            const diag = { thinking, ...parsedJson };
                            const conf = (parsedJson.confidence ?? 0) as number;
                            const canShowProvs =
                                !parsedJson.rejected &&
                                !parsedJson.requires_clarification &&
                                !parsedJson.unserviced &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A' &&
                                conf >= 85;
                            // Fetch providers immediately when we identify an actual issue (diagnosis + trade) — don't wait for high confidence
                            const canFetchEarly =
                                parsedJson.diagnosis &&
                                !parsedJson.rejected &&
                                !parsedJson.requires_clarification &&
                                !parsedJson.unserviced &&
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
                                // Show provider skeleton immediately (before any await) so we never flash "No providers"
                                setIsLoadingProvidersForMessage(newMsgIndex);
                                // Ensure conversation exists before saving message (avoids FK violation)
                                const firstDesc =
                                    parsedJson.image_descriptions?.[0];
                                if (firstDesc) {
                                    setInitialImageDescription(firstDesc);
                                    await saveConversation({
                                        diag,
                                        initial_image_description: firstDesc,
                                    });
                                } else {
                                    await saveConversation({ diag });
                                }
                                void saveMessage(
                                    'assistant',
                                    assistantContent,
                                    [],
                                    true,
                                    diag,
                                    undefined
                                );
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
                                    const msgIdx =
                                        earlyMessageIndexRef.current >= 0
                                            ? earlyMessageIndexRef.current
                                            : 0;
                                    setMessages((prev) => {
                                        const lastIdx = prev.length - 1;
                                        if (lastIdx >= 0 && prev[lastIdx]?.role === 'assistant') {
                                            return prev.map((m, i) =>
                                                i === lastIdx
                                                    ? {
                                                          ...m,
                                                          content: assistantContent,
                                                          diagnosis: diag,
                                                      }
                                                    : m
                                            );
                                        }
                                        return prev;
                                    });
                                    const firstDesc =
                                        parsedJson.image_descriptions?.[0];
                                    if (firstDesc) {
                                        setInitialImageDescription(firstDesc);
                                        await saveConversation({
                                            diag,
                                            initial_image_description: firstDesc,
                                        });
                                    } else {
                                        await saveConversation({ diag });
                                    }
                                    updateMessageContent(msgIdx, assistantContent, diag);
                                } else {
                                    initialMessageAddedRef.current = true;
                                    const firstDesc =
                                        parsedJson.image_descriptions?.[0];
                                    if (firstDesc) {
                                        setInitialImageDescription(firstDesc);
                                        await saveConversation({
                                            diag,
                                            initial_image_description: firstDesc,
                                        });
                                    } else {
                                        await saveConversation({ diag });
                                    }
                                    saveMessage(
                                        'assistant',
                                        assistantContent,
                                        [],
                                        true,
                                        diag,
                                        undefined
                                    );
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
        [
            id,
            saveConversation,
            saveMessage,
            cleanThinkingText,
            userLocation,
            fetchProvidersForMessage,
            updateMessageContent,
        ]
    );

    const useLocationRef = useRef(locationAndFetchProviders);
    useLocationRef.current = locationAndFetchProviders;

    useEffect(
        () => () => {
            startInitialDiagnosisAbortRef.current?.abort();
            startInitialDiagnosisAbortRef.current = null;
        },
        []
    );

    useEffect(() => {
        if (!id) return;
        if (authLoading || !user?.id) return;

        const imageData = getImageData();
        if (imageData && imageData.id === id) {
            setImageSrc(imageData.dataUrl);
        }

        let cancelled = false;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        const getCancelled = () => cancelled;

        loadConversation(getCancelled).then((result) => {
            if (cancelled) return;
            const loadedMsgs =
                result && typeof result === 'object' && 'msgs' in result ? result.msgs : null;
            const loadedConvWithImage =
                result && typeof result === 'object' && 'loadedConvWithImage' in result
                    ? result.loadedConvWithImage
                    : false;
            // Only clear the store when we loaded the conversation with an image from DB.
            // Keep it when DB returned empty (dummy client, new conv, or load failed) so refresh can restore.
            if (imageData && imageData.id === id && loadedConvWithImage) {
                clearImageData();
            }
            if (loadedMsgs && loadedMsgs.length > 0) {
                setIsDiagnosing(false);
                // Mark as already diagnosed so we never re-run the initial diagnosis on refresh
                setHasStartedDiagnosis(true);
                diagnosisStartedRef.current = true;
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
                        table: 'diagnoses',
                        filter: `id=eq.${id}`,
                    },
                    (payload: { new: { diagnosis?: DiagnosisData } }) => {
                        if (payload.new.diagnosis && !cancelled) {
                            setDiagnosis(payload.new.diagnosis);
                        }
                    }
                )
                .subscribe();
        });

        return () => {
            cancelled = true;
            if (channel) supabase.removeChannel(channel);
        };
    }, [id, loadConversation, authLoading, user?.id]);

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
            (pos) => useLocationRef.current(pos.coords.latitude, pos.coords.longitude),
            () => {
                // Silently fail — user will tap "Use my location" when providers load (required on some mobile browsers)
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
        );
    }, [id]);

    // Start (or resume) initial diagnosis when we have an image and either no messages yet,
    // or the last message is from the user with no diagnosis (e.g. user refreshed during analysis).
    useEffect(() => {
        const img = imageSrc;
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const lastIsUser = lastMessage?.role === 'user';
        const hasNoDiagnosis = !diagnosis?.diagnosis;
        const canStart =
            img &&
            !hasStartedDiagnosis &&
            (messages.length === 0 || (lastIsUser && hasNoDiagnosis));
        const shouldStart = canStart && isLoaded;
        if (shouldStart) {
            const userContext = directTradeResult
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
        messages,
        diagnosis,
        hasStartedDiagnosis,
        directTradeResult,
        directTradeSelection,
        startInitialDiagnosis,
    ]);

    const handleSend = async (
        overrideMessage?: string,
        options?: { diagnosisRejected?: boolean }
    ) => {
        const msgToSend = String(overrideMessage ?? message ?? '').trim();
        const attachmentsToSend = options?.diagnosisRejected ? [] : pendingAttachments;
        if (!msgToSend && attachmentsToSend.length === 0) return;
        if (isResponding) return;

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

        const userMsgId = (await saveMessage('user', userMsg, attachmentsToSend))?.id;
        setDiagnosis((prev) => (prev ? { ...prev, thinking: '' } : prev));

        try {
            const initialMsgContent = diagnosis
                ? `DIAGNOSIS: ${diagnosis.diagnosis}\n\n${diagnosis.action_required}\n\nESTIMATED COST: ${diagnosis.estimated_cost}`
                : '';

            const isFirstMessage = messages.length === 0;
            const historyForApi = [
                ...(initialMsgContent
                    ? [{ role: 'assistant' as const, content: initialMsgContent }]
                    : []),
                ...messages,
                // Always include the new user message so the API has the full current turn
                newMessage,
            ].map((m) => ({
                role: m.role,
                content: m.content,
                attachments: [],
                attachment_descriptions: m.attachment_descriptions ?? [],
            }));

            const providersFromMessages =
                [...messages].reverse().find((m) => m.providers && m.providers.length > 0)
                    ?.providers ?? [];
            const userContext = directTradeResult
                ? { trade: directTradeResult.trade, diagnosis: directTradeResult.diagnosis }
                : directTradeSelection
                  ? { trade: directTradeSelection.trade, diagnosis: directTradeSelection.diagnosis }
                  : undefined;

            const primaryImage =
                isFirstMessage
                    ? imageSrc ?? null
                    : attachmentsToSend.length > 0 &&
                        typeof attachmentsToSend[0] === 'string' &&
                        attachmentsToSend[0].startsWith('data:')
                      ? attachmentsToSend[0]
                      : null;
            const attachmentsForApi =
                primaryImage && attachmentsToSend[0] === primaryImage
                    ? attachmentsToSend.slice(1)
                    : attachmentsToSend;
            const res = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: primaryImage,
                    textQuery: msgToSend || undefined,
                    attachments:
                        attachmentsForApi.length > 0 ? attachmentsForApi : undefined,
                    history: historyForApi,
                    ...(initialImageDescription && {
                        initial_image_description: initialImageDescription,
                    }),
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

            // Track the index of the assistant message we append so provider results
            // are applied to the correct message (avoid stale `messages.length`).
            let assistantMsgIndex = -1;
            setMessages((prev) => {
                assistantMsgIndex = prev.length;
                return [...prev, { role: 'assistant', content: '', feedback: null }];
            });

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
                                              (previousDiagnosis?.diagnosis || '')
                                                  .trim()
                                                  .toLowerCase() !==
                                                  (parsedJson.diagnosis || '')
                                                      .trim()
                                                      .toLowerCase() ||
                                              (previousDiagnosis?.trade || '')
                                                  .trim()
                                                  .toLowerCase() !==
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
                                clean(previousDiagnosis?.diagnosis) !==
                                    clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);
                            const canShowProvs =
                                conf >= 85 &&
                                !parsedJson.requires_clarification &&
                                !parsedJson.rejected &&
                                !parsedJson.unserviced &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A';
                            const canFetchEarly =
                                !parsedJson.requires_clarification &&
                                !parsedJson.rejected &&
                                !parsedJson.unserviced &&
                                parsedJson.trade &&
                                parsedJson.trade !== 'N/A';

                            if (fullText.toLowerCase().includes('</json>')) {
                                void saveConversation({ diag });
                                saveMessage(
                                    'assistant',
                                    assistantContent,
                                    [],
                                    hasChanged,
                                    diag,
                                    undefined
                                );
                                if (
                                    userMsgId &&
                                    parsedJson.image_descriptions &&
                                    Array.isArray(parsedJson.image_descriptions) &&
                                    parsedJson.image_descriptions.length > 0
                                ) {
                                    await updateMessageAttachmentDescriptions(
                                        userMsgId,
                                        parsedJson.image_descriptions
                                    );
                                    setMessages((prev) => {
                                        const next = [...prev];
                                        const lastUserIdx = [...next]
                                            .map((m, i) => (m.role === 'user' ? i : -1))
                                            .filter((i) => i >= 0)
                                            .pop();
                                        if (lastUserIdx !== undefined && lastUserIdx >= 0) {
                                            next[lastUserIdx] = {
                                                ...next[lastUserIdx],
                                                attachment_descriptions: parsedJson.image_descriptions,
                                            };
                                        }
                                        return next;
                                    });
                                }
                            }
                            if (canFetchEarly && !providersFetchedForStream) {
                                providersFetchedForStream = true;
                                const msgIdx =
                                    assistantMsgIndex >= 0 ? assistantMsgIndex : messages.length;
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
                            if (parsedJson.refetch_providers) {
                                const loc = userLocation;
                                const hasLoc =
                                    typeof loc?.lat === 'number' &&
                                    typeof loc?.lng === 'number' &&
                                    !isNaN(loc.lat) &&
                                    !isNaN(loc.lng);
                                if (hasLoc) {
                                    const trade =
                                        parsedJson.trade ||
                                        previousDiagnosis?.trade ||
                                        diagnosis?.trade;
                                    if (trade && trade !== 'N/A') {
                                        const lastWithDiag = [...messages]
                                            .reverse()
                                            .findIndex(
                                                (m) =>
                                                    m.role === 'assistant' &&
                                                    m.diagnosis &&
                                                    (m.providers != null ||
                                                        m.providerNextPageToken != null)
                                            );
                                        const targetIdx =
                                            lastWithDiag >= 0
                                                ? messages.length - 1 - lastWithDiag
                                                : messages.length - 1;
                                        const targetMsg = messages[targetIdx];
                                        const pageToken =
                                            targetMsg?.providerNextPageToken ?? undefined;
                                        const searchQuery = targetMsg?.providerSearchQuery ?? trade;
                                        if (targetMsg) {
                                            if (pageToken) {
                                                fetchProvidersForMessage(
                                                    targetIdx,
                                                    trade,
                                                    loc.lat,
                                                    loc.lng,
                                                    targetMsg.content ?? '',
                                                    targetMsg.hasUpdatedDiagnosis ?? false,
                                                    targetMsg.diagnosis ?? diag,
                                                    { pageToken, searchQuery }
                                                );
                                            } else {
                                                toast(
                                                    'No additional providers available in your area.'
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        } else if (fullText.toLowerCase().includes('</json>')) {
                            saveMessage('assistant', assistantContent, [], false);
                            if (
                                userMsgId &&
                                parsedJson.image_descriptions &&
                                Array.isArray(parsedJson.image_descriptions) &&
                                parsedJson.image_descriptions.length > 0
                            ) {
                                await updateMessageAttachmentDescriptions(
                                    userMsgId,
                                    parsedJson.image_descriptions
                                );
                                setMessages((prev) => {
                                    const next = [...prev];
                                    const lastUserIdx = [...next]
                                        .map((m, i) => (m.role === 'user' ? i : -1))
                                        .filter((i) => i >= 0)
                                        .pop();
                                    if (lastUserIdx !== undefined && lastUserIdx >= 0) {
                                        next[lastUserIdx] = {
                                            ...next[lastUserIdx],
                                            attachment_descriptions: parsedJson.image_descriptions,
                                        };
                                    }
                                    return next;
                                });
                            }
                        }
                    } catch (e) {
                        const parsed = tryParseDiagnosisJson(fullText) as Record<
                            string,
                            unknown
                        > | null;
                        if (parsed) {
                            const assistantContent = buildAssistantContent(
                                parsed as {
                                    message?: string;
                                    diagnosis?: string;
                                    action_required?: string;
                                },
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
                                                  (previousDiagnosis?.diagnosis || '')
                                                      .trim()
                                                      .toLowerCase() !==
                                                      (diagObj.diagnosis || '')
                                                          .trim()
                                                          .toLowerCase() ||
                                                  (previousDiagnosis?.trade || '')
                                                      .trim()
                                                      .toLowerCase() !==
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
                                    !(parsed.unserviced as boolean) &&
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
                                if (
                                    parsed.refetch_providers &&
                                    hasLoc &&
                                    tradeVal &&
                                    tradeVal !== 'N/A'
                                ) {
                                    const lastWithDiag = [...messages]
                                        .reverse()
                                        .findIndex(
                                            (m) =>
                                                m.role === 'assistant' &&
                                                m.diagnosis &&
                                                (m.providers != null ||
                                                    m.providerNextPageToken != null)
                                        );
                                    const targetIdx =
                                        lastWithDiag >= 0
                                            ? messages.length - 1 - lastWithDiag
                                            : messages.length - 1;
                                    const targetMsg = messages[targetIdx];
                                    if (targetMsg) {
                                        if (targetMsg.providerNextPageToken) {
                                            fetchProvidersForMessage(
                                                targetIdx,
                                                tradeVal,
                                                loc.lat,
                                                loc.lng,
                                                targetMsg.content ?? '',
                                                targetMsg.hasUpdatedDiagnosis ?? false,
                                                targetMsg.diagnosis ?? fullDiag,
                                                {
                                                    pageToken: targetMsg.providerNextPageToken,
                                                    searchQuery:
                                                        targetMsg.providerSearchQuery ?? tradeVal,
                                                }
                                            );
                                        } else {
                                            toast(
                                                'No additional providers available in your area.'
                                            );
                                        }
                                    }
                                }
                                await saveConversation({ diag: fullDiag });
                                saveMessage(
                                    'assistant',
                                    assistantContent,
                                    [],
                                    hasChanged,
                                    fullDiag,
                                    undefined
                                );
                                if (
                                    userMsgId &&
                                    (parsed as { image_descriptions?: string[] }).image_descriptions &&
                                    Array.isArray((parsed as { image_descriptions?: string[] }).image_descriptions) &&
                                    (parsed as { image_descriptions: string[] }).image_descriptions.length > 0
                                ) {
                                    const descs = (parsed as { image_descriptions: string[] }).image_descriptions;
                                    await updateMessageAttachmentDescriptions(userMsgId, descs);
                                    setMessages((prev) => {
                                        const next = [...prev];
                                        const lastUserIdx = [...next]
                                            .map((m, i) => (m.role === 'user' ? i : -1))
                                            .filter((i) => i >= 0)
                                            .pop();
                                        if (lastUserIdx !== undefined && lastUserIdx >= 0) {
                                            next[lastUserIdx] = {
                                                ...next[lastUserIdx],
                                                attachment_descriptions: descs,
                                            };
                                        }
                                        return next;
                                    });
                                }
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
                unserviced?: boolean;
            } | null;
            if (finalParsed?.diagnosis) {
                let didUpdate = false;
                setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === 'assistant' && !last.diagnosis) {
                        didUpdate = true;
                        const assistantContent = buildAssistantContent(
                            finalParsed as {
                                message?: string;
                                diagnosis?: string;
                                action_required?: string;
                            },
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
                        !finalParsed.unserviced &&
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
                                    msgContent: buildAssistantContent(
                                        finalParsed as {
                                            message?: string;
                                            diagnosis?: string;
                                            action_required?: string;
                                        },
                                        currentThinking
                                    ),
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
                            content:
                                extracted ||
                                "I'm sorry, I had trouble processing that. Please try again.",
                        };
                    }
                }
                return next;
            });
        } catch (err) {
            console.error('Follow-up failed:', err);
            toast.error(
                err instanceof Error ? err.message : 'Failed to get response. Please try again.'
            );
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

            const isFirstRegenTurn = messageHistory.filter((m) => m.role === 'user').length === 1;
            const historyForApi = [
                ...(initialMsgContent
                    ? [{ role: 'assistant' as const, content: initialMsgContent }]
                    : []),
                ...(isFirstRegenTurn
                    ? messageHistory
                    : messageHistory.filter((m) => m !== lastUserMsg)),
            ].map((m) => ({
                role: m.role,
                content: m.content,
                attachments: [],
                attachment_descriptions: m.attachment_descriptions ?? [],
            }));

            const providersFromRegenerate =
                [...messageHistory].reverse().find((m) => m.providers && m.providers.length > 0)
                    ?.providers ?? [];
            const res = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image:
                        isFirstRegenTurn && !initialImageDescription ? imageSrc : null,
                    textQuery: isFirstRegenTurn ? undefined : lastUserMsg.content,
                    history: historyForApi,
                    ...(initialImageDescription && {
                        initial_image_description: initialImageDescription,
                    }),
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

            // Track the index of the assistant message we append so provider results
            // are applied to the correct message (avoid stale `messages.length`).
            let assistantMsgIndex = -1;
            setMessages((prev) => {
                assistantMsgIndex = prev.length;
                return [...prev, { role: 'assistant', content: '', feedback: null }];
            });

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
                                              (previousDiagnosis?.diagnosis || '')
                                                  .trim()
                                                  .toLowerCase() !==
                                                  (parsedJson.diagnosis || '')
                                                      .trim()
                                                      .toLowerCase() ||
                                              (previousDiagnosis?.trade || '')
                                                  .trim()
                                                  .toLowerCase() !==
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
                                clean(previousDiagnosis?.diagnosis) !==
                                    clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);
                            if (isComplete) {
                                await saveConversation({ diag });
                                saveMessage(
                                    'assistant',
                                    assistantContent,
                                    [],
                                    hasChanged,
                                    diag,
                                    undefined
                                );
                                const canShowProvs =
                                    conf >= 85 &&
                                    !parsedJson.requires_clarification &&
                                    !parsedJson.rejected &&
                                    !parsedJson.unserviced &&
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
                                if (parsedJson.refetch_providers && hasLoc) {
                                    const trade =
                                        parsedJson.trade ||
                                        previousDiagnosis?.trade ||
                                        diagnosis?.trade;
                                    if (trade && trade !== 'N/A') {
                                        const prevMsgs = messages.slice(0, index + 1);
                                        const lastWithDiag = [...prevMsgs]
                                            .reverse()
                                            .findIndex(
                                                (m) =>
                                                    m.role === 'assistant' &&
                                                    m.diagnosis &&
                                                    (m.providers != null ||
                                                        m.providerNextPageToken != null)
                                            );
                                        const targetIdx =
                                            lastWithDiag >= 0
                                                ? prevMsgs.length - 1 - lastWithDiag
                                                : index;
                                        const targetMsg = prevMsgs[targetIdx];
                                        if (targetMsg) {
                                            if (targetMsg.providerNextPageToken) {
                                                fetchProvidersForMessage(
                                                    targetIdx,
                                                    trade,
                                                    loc.lat,
                                                    loc.lng,
                                                    targetMsg.content ?? '',
                                                    targetMsg.hasUpdatedDiagnosis ?? false,
                                                    targetMsg.diagnosis ?? diag,
                                                    {
                                                        pageToken: targetMsg.providerNextPageToken,
                                                        searchQuery:
                                                            targetMsg.providerSearchQuery ?? trade,
                                                    }
                                                );
                                            } else {
                                                toast(
                                                    'No additional providers available in your area.'
                                                );
                                            }
                                        }
                                    }
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
                            content:
                                extracted ||
                                "I'm sorry, I had trouble processing that. Please try again.",
                        };
                    }
                }
                return next;
            });
        } catch (err) {
            console.error('Regeneration failed:', err);
            toast.error(
                err instanceof Error ? err.message : 'Failed to regenerate. Please try again.'
            );
        } finally {
            setIsResponding(false);
        }
    };

    // --- Render ---
    // Only show the thinking/analysing indicator when actively running — never on a loaded conversation
    const showThinking =
        (isDiagnosing || isResponding) ||
        (isLoaded && !hasStartedDiagnosis && !isDiagnosing && displayImage && messages.length === 0 && !diagnosis?.diagnosis);

    if (!id) {
        router.replace('/');
        return null;
    }

    // Show a skeleton while the conversation is loading
    if (!isLoaded && !displayImage) {
        return (
            <div className="flex flex-1 flex-col bg-background min-h-screen">
                <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-4">
                    {initialTrade ? <ChatPageTradeSkeleton /> : <ChatPageImageSkeleton />}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-dvh min-h-screen bg-background overflow-x-hidden overflow-y-hidden">
            <main
                ref={mainRef}
                className="flex flex-1 min-h-0 flex-col px-0 sm:px-4 overflow-hidden"
            >
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                    <div
                        className={`mx-auto w-full max-w-full flex flex-col gap-6 min-w-0 ${
                            displayImage
                                ? 'max-w-7xl px-4 py-4'
                                : 'max-w-7xl px-4 py-12 sm:px-6 lg:px-8'
                        }`}
                    >
                        {/* Provider results - when direct trade with providers; hide if a message already shows diagnosis+providers (avoid duplicate) */}
                        {(directTradeResult ||
                            (directTradeSelection && isLoadingDirectProviders)) &&
                            !messages.some(
                                (m) =>
                                    m.role === 'assistant' &&
                                    m.diagnosis &&
                                    (m.providers?.length ?? 0) > 0
                            ) && (
                                <DiagnosisResponseCard
                                    conversationId={id}
                                    diagnosis={{
                                        thinking: '',
                                        diagnosis: (directTradeResult || directTradeSelection)!
                                            .diagnosis,
                                        trade: (directTradeResult || directTradeSelection)!.trade,
                                        action_required:
                                            'In order to generate your Scandio Report, please upload a clear photo of the issue.',
                                        estimated_cost: '',
                                        confidence: 100,
                                    }}
                                    providers={directTradeResult?.providers ?? []}
                                    emergingProviders={
                                        directTradeResult?.emergingProviders ?? []
                                    }
                                    nearbyOnlyProviders={
                                        directTradeResult?.nearbyOnlyProviders ?? []
                                    }
                                    isLoadingProviders={isLoadingDirectProviders}
                                    userLocation={userLocation}
                                    onRequestLocation={() =>
                                        getCurrentLocation({
                                            directTrade: {
                                                trade: (directTradeResult ||
                                                    directTradeSelection)!
                                                    .trade,
                                                diagnosis: (directTradeResult ||
                                                    directTradeSelection)!
                                                    .diagnosis,
                                            },
                                        })
                                    }
                                    onAddressSelect={(loc) => {
                                        setUserLocation(loc);
                                        setIsLoadingDirectProviders(true);
                                        const dt = directTradeResult || directTradeSelection;
                                        if (dt)
                                            fetchDirectProviders(
                                                dt.trade,
                                                loc.lat,
                                                loc.lng,
                                                dt.diagnosis
                                            );
                                    }}
                                    onConfirmYes={undefined}
                                    onConfirmNo={undefined}
                                    diagnosisConfirmed
                                    trade={(directTradeResult || directTradeSelection)!.trade}
                                    openPopoverId={openPopoverId}
                                    setOpenPopoverId={setOpenPopoverId}
                                    hasImage={false}
                                    providerRadiusKm={providerRadiusKm}
                                    onRadiusChange={(km) => {
                                        setProviderRadiusKm(km);
                                        const dt = directTradeResult || directTradeSelection;
                                        if (dt && userLocation) {
                                            fetchDirectProviders(
                                                dt.trade,
                                                userLocation.lat,
                                                userLocation.lng,
                                                dt.diagnosis,
                                                km
                                            );
                                        }
                                    }}
                                />
                            )}

                        {/* Image on left (AI side), then thinking below it, then messages */}
                        {displayImage && (
                            <div className="flex flex-col gap-4 items-start">
                                {/* Initial diagnosis image - left-aligned (AI side), half-width on desktop */}
                                {displayImage && (
                                    <div className="flex flex-col gap-2 w-full md:w-1/2 items-start">
                                        <a
                                            href={displayImageHref || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full aspect-[16/10] md:aspect-[4/3] rounded-lg overflow-hidden border border-border/50 hover:opacity-95"
                                            onClick={(e) => {
                                                // Prefer the stored Supabase URL when available.
                                                if (displayImageHref && !displayImageHref.startsWith('data:')) {
                                                    return;
                                                }
                                                if (displayImage && displayImage.startsWith('data:')) {
                                                    e.preventDefault();
                                                    openInNewTab(displayImage);
                                                }
                                            }}
                                        >
                                            <img
                                                src={displayImage}
                                                alt="Image being analysed"
                                                className="w-full h-full object-cover bg-muted/30"
                                            />
                                        </a>
                                    </div>
                                )}
                                {/* Thinking appears below the image with clear spacing */}
                                {(showThinking ||
                                    (diagnosis?.thinking &&
                                        !diagnosis?.requires_clarification)) && (
                                    <blockquote className="border-l-2 border-input pl-3 w-full">
                                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                            {diagnosis?.thinking
                                                ? thinkingForDisplay(diagnosis.thinking)
                                                : 'Analysing…'}
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
                                            onFeedback={(type) =>
                                                handleMessageFeedback(i, type)
                                            }
                                            onCopy={() =>
                                                handleCopy(
                                                    typeof msg.content === 'string'
                                                        ? msg.content
                                                        : ''
                                                )
                                            }
                                            onRegenerate={() => handleRegenerate(i)}
                                            inlineDiagnosisProps={
                                                msg.role === 'assistant' && msg.diagnosis
                                                    ? {
                                                          conversationId: id,
                                                          userLocation,
                                                          isLoadingProviders:
                                                              isLoadingProvidersForMessage === i,
                                                          openPopoverId,
                                                          setOpenPopoverId,
                                                          onRequestLocation: () =>
                                                              getCurrentLocation({
                                                                  messageIndex: i,
                                                                  trade: msg.diagnosis!.trade,
                                                                  msgContent: msg.content,
                                                                  hasUpdatedDiagnosis:
                                                                      msg.hasUpdatedDiagnosis ??
                                                                      false,
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
                                                                  msg.hasUpdatedDiagnosis ??
                                                                      false,
                                                                  msg.diagnosis!
                                                              );
                                                          },
                                                          providerRadiusKm,
                                                          onRadiusChange: (km) => {
                                                              setProviderRadiusKm(km);
                                                              if (userLocation)
                                                                  fetchProvidersForMessage(
                                                                      i,
                                                                      msg.diagnosis!.trade ?? '',
                                                                      userLocation.lat,
                                                                      userLocation.lng,
                                                                      msg.content ?? '',
                                                                      msg.hasUpdatedDiagnosis ??
                                                                          false,
                                                                      msg.diagnosis!,
                                                                      { radiusKm: km }
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
                        )}
                    </div>
                </div>

                {/* Chat footer removed */}
            </main>
        </div>
    );
}
