/**
 * File: results.tsx
 * Description: The primary results page that handles AI image diagnosis, 
 * local service provider discovery, and an interactive chat interface.
 */

"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { getImageData, clearImageData } from "@/lib/image-store";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { 
    Paperclip,
    ThumbUp as ThumbsUp, 
    ThumbDown as ThumbsDown, 
    Star,
    StarFill,
    Copy, 
    RotateCounterClockwise as RotateCcw, 
    Cross as X,
} from "geist-icons";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { 
    Phone, 
    Envelope as Mail, 
    Globe,
    Location as LocationIcon
} from "geist-icons";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { compressImage } from "@/lib/image-compression";

// --- Types ---

interface DiagnosisData {
    thinking: string;
    diagnosis: string;
    trade: string;
    action_required: string;
    estimated_cost: string;
    message?: string;
}

interface Message {
    role: "user" | "assistant";
    content: string;
    feedback?: "up" | "down" | null;
    attachments?: string[];
    hasUpdatedDiagnosis?: boolean;
}

interface Service {
    short: string;
    full: string;
}

interface Provider {
    name: string;
    address: string;
    rating?: number;
    ratingCount?: number;
    phone?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    summary: string;
    services: Service[];
    distanceText?: string;
    isOpen?: boolean | null;
}

// --- Main Component ---

export default function Results() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    
    // --- State: Core Data ---
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [hasStartedDiagnosis, setHasStartedDiagnosis] = useState(false);
    const diagnosisStartedRef = useRef(false);
    const [isResponding, setIsResponding] = useState(false);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState<string[]>([]);
    
    // --- Refs ---
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const diagnosisRef = useRef<HTMLDivElement>(null);

    // Log state changes for debugging
    useEffect(() => {
        console.log("UI State Update:", { 
            isDiagnosing, 
            hasDiagnosis: !!diagnosis, 
            diagnosisTitle: diagnosis?.diagnosis,
            hasStartedDiagnosis 
        });
    }, [isDiagnosing, diagnosis, hasStartedDiagnosis]);

    // --- Persistence & Usage ---

    /**
     * Loads existing conversation and messages from Supabase.
     */
    const loadConversation = useCallback(async () => {
        if (!id) return;
        
        console.log("Loading conversation:", id);
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Database timeout")), 5000)
        );

        try {
            const fetchPromise = (async () => {
                // Run conversation and messages fetch in parallel
                const [convResult, msgsResult] = await Promise.all([
                    supabase.from('conversations').select('*').eq('id', id),
                    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true })
                ]);
                
                if (convResult.error) {
                    console.error("Supabase Conv Error Details:", convResult.error);
                    throw convResult.error;
                }
                
                if (msgsResult.error) {
                    console.error("Supabase Msgs Error Details:", msgsResult.error);
                }
                
                return { conv: convResult.data?.[0], msgs: msgsResult.data };
            })();

            const result = await Promise.race([fetchPromise, timeout]) as any;
            const conv = result?.conv;
            const msgs = result?.msgs;
            
            if (conv) {
                if (conv.image_url) setImageSrc(conv.image_url);
                if (conv.diagnosis_json) setDiagnosis(conv.diagnosis_json);
                if (conv.providers_json) setProviders(conv.providers_json);
                if (conv.user_lat && conv.user_lng) {
                    setUserLocation({ 
                        lat: conv.user_lat, 
                        lng: conv.user_lng, 
                        address: conv.user_address || "" 
                    });
                }
            }

            if (msgs && msgs.length > 0) {
                const mappedMsgs = msgs.map((m: any) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                    attachments: m.attachments,
                    feedback: m.feedback as "up" | "down" | null,
                    hasUpdatedDiagnosis: m.has_updated_diagnosis
                }));
                setMessages(mappedMsgs);
                return mappedMsgs;
            }
        } catch (err) {
            console.error("Failed to load conversation:", err);
        } finally {
            setIsLoaded(true);
        }
        return null;
    }, [id]);

    /**
     * Saves a new message to Supabase.
     */
    const saveMessage = async (role: "user" | "assistant", content: string, attachments: string[] = [], hasUpdatedDiagnosis: boolean = false) => {
        if (!id) return;
        const { error } = await (supabase as any).from('messages').insert({
            conversation_id: id,
            role,
            content,
            attachments,
            has_updated_diagnosis: hasUpdatedDiagnosis
        });
        if (error) console.error("Error saving message:", error);
    };

    const saveConversation = async (overrides?: { 
        diag?: DiagnosisData, 
        loc?: { lat: number; lng: number; address: string },
        provs?: Provider[] 
    }) => {
        if (!id) return;
        
        const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        const finalDiagnosis = overrides?.diag || diagnosis;
        const finalLocation = overrides?.loc || userLocation;
        const finalProviders = overrides?.provs || providers;
        
        console.log("Saving conversation metadata:", { id, diagnosisTitle: finalDiagnosis?.diagnosis });

        const { error } = await (supabase as any).from('conversations').upsert({
            id,
            title: finalDiagnosis?.diagnosis || "New Diagnosis",
            image_url: imageSrc,
            user_lat: finalLocation?.lat,
            user_lng: finalLocation?.lng,
            user_address: finalLocation?.address,
            diagnosis_json: finalDiagnosis,
            providers_json: finalProviders,
            device_type: deviceType,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString()
        });
        if (error) console.error("Error saving conversation:", error);
    };

    // --- Utilities ---

    /**
     * Smoothly scrolls the chat container to the latest message.
     */
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const scrollToDiagnosis = useCallback(() => {
        diagnosisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // --- Data Fetching: Providers ---

    /**
     * Fetches local service providers from the API based on location and trade.
     * @param lat - Latitude
     * @param lng - Longitude
     * @param tradeToSearch - The specific trade (e.g. "Plumber") to search for.
     */
    const fetchProviders = useCallback(async (lat: number, lng: number, tradeToSearch?: string) => {
        const trade = tradeToSearch || diagnosis?.trade;
        if (!trade) return;
        
        setIsLoadingProviders(true);
        try {
            const res = await fetch("/api/providers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat, lng, trade })
            });
            const data = await res.json();
            if (res.ok && data.providers) {
                setProviders(data.providers);
                saveConversation({ provs: data.providers });
            } else {
                console.error("API Error:", data.error || "Unknown error");
            }
        } catch (err) {
            console.error("Failed to fetch providers:", err);
        } finally {
            setIsLoadingProviders(false);
        }
    }, [diagnosis?.trade]);

    /**
     * Gets the user's current geolocation and triggers provider search.
     * @param tradeToSearch - Optional trade to override current diagnosis trade.
     */
    const getCurrentLocation = useCallback((tradeToSearch?: string) => {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                
                // Parallelize geocoding (for the UI address) and provider fetching
                const geocodePromise = fetch("/api/geocode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat, lng })
                }).then(res => res.json()).catch(() => ({ address: "Current Location" }));

                const providersPromise = fetchProviders(lat, lng, tradeToSearch);

                try {
                    const [geoData] = await Promise.all([geocodePromise, providersPromise]);
                    const address = geoData.address || "Current Location";
                    const loc = { lat, lng, address };
                    setUserLocation(loc);
                    saveConversation({ loc });
                } catch (e) {
                    console.error("Error in location-based fetching:", e);
                    setUserLocation({ lat, lng, address: "Current Location" });
                }
            },
            (err) => {
                console.error("Location access denied", err);
                toast.error("Location access denied");
            }
        );
    }, [fetchProviders]);

    const startInitialDiagnosis = useCallback(async (img: string) => {
        if (diagnosisStartedRef.current) return;
        diagnosisStartedRef.current = true;
        setHasStartedDiagnosis(true);
        setIsDiagnosing(true);
        setDiagnosis(null);
        
        console.log("Starting initial diagnosis... Image length:", img.length);
        try {
            const res = await fetch("/api/diagnose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: img })
            });
            
            console.log("Diagnosis response status:", res.status);
            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: "Unknown error" }));
                console.error("Diagnosis API error:", error);
                toast.error(error.error || "Failed to start analysis");
                setIsDiagnosing(false);
                return; // Don't reset hasStartedDiagnosis immediately to avoid loop
            }

            if (!res.body) {
                console.error("Diagnosis response body is null");
                setIsDiagnosing(false);
                return;
            }
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let currentThinking = "";
            let isSearchTriggered = false;

            console.log("Beginning to read stream...");
            while (true) {
                const { done, value } = await reader.read();
                const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                fullText += chunk;

                if (done) {
                    console.log("Stream finished. Total text length:", fullText.length);
                    // console.log("Full AI response text:", fullText);
                    
                    // Final attempt to parse if not already done
                    if (!diagnosis?.diagnosis) {
                        // 1. Try tags first
                        const finalJsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                        if (finalJsonMatch) {
                            await processJson(finalJsonMatch[1], currentThinking, true);
                        } else {
                            // 2. Fallback: Try to find ANY JSON object in the text
                            const anyJsonMatch = fullText.match(/\{[\s\S]*\}/);
                            if (anyJsonMatch) {
                                console.log("Found raw JSON fallback at end");
                                await processJson(anyJsonMatch[0], currentThinking, true);
                            }
                        }
                    }
                    break;
                }
                
                // 1. Extract thinking - refined to strictly exclude tags
                const thoughtMatch = fullText.match(/<(?:thought|thought_process)>([\s\S]*?)(?:<\/(?:thought|thought_process)>|$)/i) 
                    || fullText.match(/```thought\s*([\s\S]*?)(?:```|$)/i);
                
                if (thoughtMatch) {
                    // Remove any internal tags if the AI accidentally nested them
                    currentThinking = thoughtMatch[1]
                        .replace(/<\/?(?:thought|thought_process)>/gi, "")
                        .replace(/```thought/gi, "")
                        .replace(/```/gi, "")
                        .trim();
                    
                    setDiagnosis(prev => ({
                        thinking: currentThinking,
                        diagnosis: prev?.diagnosis || "",
                        trade: prev?.trade || "",
                        action_required: prev?.action_required || "",
                        estimated_cost: prev?.estimated_cost || ""
                    }));
                }

                // 2. Extract JSON
                const jsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                if (jsonMatch) {
                    await processJson(jsonMatch[1], currentThinking, fullText.toLowerCase().includes("</json>"));
                } else {
                    // Try to find JSON even if tags are missing or wrapped in markdown
                    const anyJsonMatch = fullText.match(/\{[\s\S]*\}/);
                    if (anyJsonMatch) {
                        await processJson(anyJsonMatch[0], currentThinking, false);
                    }
                }
            }

            async function processJson(jsonText: string, thinking: string, isComplete: boolean) {
                // Clean up markdown artifacts and surrounding whitespace
                let cleaned = jsonText.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
                
                // Early trade detection
                if (!isSearchTriggered) {
                    const tradeMatch = cleaned.match(/"trade"\s*:\s*"([^"]+)"/i);
                    if (tradeMatch && tradeMatch[1]) {
                        console.log("Early trade detected:", tradeMatch[1]);
                        isSearchTriggered = true;
                        getCurrentLocation(tradeMatch[1]);
                    }
                }

                // Try to parse partial or full JSON
                try {
                    // Find the last valid-looking closing brace if not complete
                    let toParse = cleaned;
                    if (!isComplete && !cleaned.endsWith("}")) {
                        const lastBrace = cleaned.lastIndexOf("}");
                        if (lastBrace !== -1) {
                            toParse = cleaned.substring(0, lastBrace + 1);
                        }
                    }

                    const parsedJson = JSON.parse(toParse);
                    if (parsedJson.diagnosis) {
                        setDiagnosis({ thinking, ...parsedJson });
                        
                        if (isComplete) {
                            console.log("JSON complete, saving to Supabase...");
                            await saveConversation({ diag: { thinking, ...parsedJson } });
                            saveMessage("assistant", parsedJson.message || `I identified a ${parsedJson.diagnosis}.`, [], false);
                        }
                    }
                } catch (e) {
                    // console.log("JSON parse skipped (incomplete)");
                }
            }
        } catch (err) {
            console.error("Diagnosis critical failure:", err);
            toast.error("Diagnosis failed. Please check your internet connection.");
        } finally {
            setIsDiagnosing(false);
            console.log("Diagnosis process finished.");
        }
    }, [id, saveConversation, saveMessage, getCurrentLocation]);

    /**
     * Re-fetches providers if they are missing on page load/refresh.
     */
    useEffect(() => {
        if (isLoaded && userLocation && diagnosis?.trade && providers.length === 0 && !isLoadingProviders) {
            console.log("Auto-fetching providers for loaded conversation:", diagnosis.trade);
            fetchProviders(userLocation.lat, userLocation.lng, diagnosis.trade);
        }
    }, [isLoaded, userLocation, diagnosis?.trade, providers.length, isLoadingProviders, fetchProviders]);

    /**
     * Initial data loading and image detection.
     */
    useEffect(() => {
        const init = async () => {
            if (!id) return;

            // 1. Get image from store (fastest)
            const imageData = getImageData();
            if (imageData && imageData.id === id) {
                console.log("Image found in local store for this id");
                setImageSrc(imageData.dataUrl);
            }

            // 2. Load DB data (including existing diagnosis/messages)
            const loadedMsgs = await loadConversation();
            
            // 3. Clear store ONLY if it's a new session
            if (imageData && (!loadedMsgs || loadedMsgs.length === 0)) {
                clearImageData();
            }
        };
        
        init();
    }, [id, loadConversation]);

    /**
     * Triggers the diagnosis when ready.
     */
    useEffect(() => {
        if (isLoaded && imageSrc && messages.length === 0 && !diagnosis && !isDiagnosing && !hasStartedDiagnosis) {
            startInitialDiagnosis(imageSrc);
        }
    }, [isLoaded, imageSrc, messages.length, diagnosis, isDiagnosing, hasStartedDiagnosis, startInitialDiagnosis]);

    // --- Chat Logic: Sending & Responding ---

    /**
     * Handles sending a user message, updating the chat UI,
     * and triggering the AI's streaming response.
     */
    const handleSend = async () => {
        if (!message.trim() && attachments.length === 0) return;
        if (isResponding) return;

        const userMsg = message.trim();
        const userAttachments = [...attachments];
        const newMessage: Message = { 
            role: "user", 
            content: userMsg,
            attachments: userAttachments
        };

        const previousDiagnosis = diagnosis;
        setMessages(prev => [...prev, newMessage]);
        setMessage("");
        setAttachments([]);
        setIsResponding(true);

        // Save user message to DB
        saveMessage("user", userMsg, userAttachments);

        try {
            // Context for AI includes initial diagnosis + conversation history + providers
            const initialMsgContent = diagnosis 
                ? `DIAGNOSIS: ${diagnosis.diagnosis}\n\n${diagnosis.action_required}\n\nESTIMATED COST: ${diagnosis.estimated_cost}`
                : "";

            const history = [
                ...(initialMsgContent ? [{ role: "assistant" as const, content: initialMsgContent }] : []),
                ...messages,
                newMessage
            ].map(m => ({ role: m.role, content: m.content, attachments: m.attachments }));

            const res = await fetch("/api/diagnose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: imageSrc, history, providers })
            });
            
            if (!res.ok) {
                const error = await res.json();
                toast.error(error.error || "Failed to get response");
                setIsResponding(false);
                return;
            }

            if (!res.body) {
                setIsResponding(false);
                return;
            }

            // Placeholder for assistant response
            setMessages(prev => [...prev, { role: "assistant", content: "", feedback: null }]);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let currentThinking = "";

            while (true) {
                const { done, value } = await reader.read();
                const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                fullText += chunk;

                if (done) {
                    console.log("Follow-up stream finished.");
                    break;
                }

                // 1. Extract thinking
                const thoughtMatch = fullText.match(/<(?:thought|thought_process)>([\s\S]*?)(?:\s*<\/(?:thought|thought_process)>|$)/i)
                    || fullText.match(/```thought\s*([\s\S]*?)(?:\s*```|$)/i);

                if (thoughtMatch && thoughtMatch[1]) {
                    currentThinking = thoughtMatch[1]
                        .replace(/<\/?(?:thought|thought_process)>/gi, "")
                        .replace(/```thought/gi, "")
                        .replace(/```/gi, "")
                        .trim();
                    
                    setDiagnosis(prev => prev ? { ...prev, thinking: currentThinking } : { 
                        thinking: currentThinking, 
                        diagnosis: "", 
                        trade: "", 
                        action_required: "", 
                        estimated_cost: "" 
                    });
                }

                // 2. Extract and parse JSON
                const jsonMatch = fullText.match(/<json>([\s\S]*?)(?:<\/json>|$)/i);
                if (jsonMatch) {
                    let cleaned = jsonMatch[1].trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
                    
                    try {
                        let toParse = cleaned;
                        if (!fullText.toLowerCase().includes("</json>") && !cleaned.endsWith("}")) {
                            const lastBrace = cleaned.lastIndexOf("}");
                            if (lastBrace !== -1) toParse = cleaned.substring(0, lastBrace + 1);
                        }

                        const parsedJson = JSON.parse(toParse);
                        if (parsedJson.diagnosis) {
                            const assistantContent = parsedJson.message || (parsedJson.diagnosis + "\n\n" + parsedJson.action_required);
                            
                            // Update the chat bubble with a robust comparison
                            const clean = (s: string | undefined) => (s || "").trim().toLowerCase();
                            const hasChanged = 
                                clean(previousDiagnosis?.diagnosis) !== clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);

                            setMessages(prev => {
                                const next = [...prev];
                                next[next.length - 1] = { 
                                    ...next[next.length - 1], 
                                    content: assistantContent,
                                    hasUpdatedDiagnosis: hasChanged
                                };
                                return next;
                            });

                            // Update main diagnosis state
                            const prevTrade = diagnosis?.trade;
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);

                            // Auto-trigger provider search
                            const userAskedForProviders = userMsg.toLowerCase().match(/provider|contact|who/);
                            if (parsedJson.trade && (parsedJson.trade !== prevTrade || providers.length === 0 || userAskedForProviders)) {
                                getCurrentLocation(parsedJson.trade);
                            }

                            // Save assistant message to DB
                            if (fullText.toLowerCase().includes("</json>")) {
                                await saveConversation({ diag });
                                saveMessage("assistant", assistantContent, [], hasChanged);
                            }
                        }
                    } catch (e) { /* partial */ }
                }
            }
        } catch (err) {
            console.error("Follow-up failed:", err);
        } finally {
            setIsResponding(false);
        }
    };

    /**
     * Handles file selection for chat attachments.
     */
    const handleFilesChosen = (files: FileList | null) => {
        if (!files) return;
        const slots = 5 - attachments.length;
        if (slots <= 0) return;

        Array.from(files).slice(0, slots).forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const url = e.target?.result as string;
                if (url) {
                    try {
                        // Compress additional attachments to ~50% the size of the main upload
                        const compressed = await compressImage(url, 512, 0.7);
                        setAttachments(prev => [...prev, compressed].slice(0, 5));
                    } catch (err) {
                        console.error("Attachment compression failed:", err);
                        setAttachments(prev => [...prev, url].slice(0, 5));
                    }
                }
            };
            reader.readAsDataURL(file);
        });
    };

    /**
     * Removes an attachment before sending.
     */
    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    /**
     * Updates thumbs up/down feedback for assistant messages.
     */
    const handleMessageFeedback = (index: number, type: "up" | "down") => {
        setMessages(prev => prev.map((msg, i) => 
            i === index ? { ...msg, feedback: msg.feedback === type ? null : type } : msg
        ));
    };

    /**
     * Copies message text to the clipboard.
     */
    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content);
    };

    /**
     * Removes the last assistant response and triggers a new one based on previous context.
     */
    const handleRegenerate = async (index: number) => {
        const messageHistory = messages.slice(0, index);
        const lastUserMsg = [...messageHistory].reverse().find(m => m.role === "user");
        
        if (!lastUserMsg) return;

        const previousDiagnosis = diagnosis;
        setMessages(prev => prev.slice(0, index));
        setIsResponding(true);

        try {
            const initialMsgContent = diagnosis 
                ? `DIAGNOSIS: ${diagnosis.diagnosis}\n\n${diagnosis.action_required}\n\nESTIMATED COST: ${diagnosis.estimated_cost}`
                : "";

            const history = [
                ...(initialMsgContent ? [{ role: "assistant" as const, content: initialMsgContent }] : []),
                ...messageHistory
            ].map(m => ({ role: m.role, content: m.content, attachments: m.attachments }));

            const res = await fetch("/api/diagnose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: imageSrc, history, providers })
            });

            if (!res.ok) {
                const error = await res.json();
                toast.error(error.error || "Failed to regenerate");
                setIsResponding(false);
                return;
            }

            if (!res.body) {
                setIsResponding(false);
                return;
            }

            setMessages(prev => [...prev, { role: "assistant", content: "", feedback: null }]);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let currentThinking = "";

            while (true) {
                const { done, value } = await reader.read();
                const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
                fullText += chunk;

                if (done) break;

                // 1. Extract thinking
                const thoughtMatch = fullText.match(/<(?:thought|thought_process)>([\s\S]*?)(?:\s*<\/(?:thought|thought_process)>|$)/i);
                if (thoughtMatch && thoughtMatch[1]) {
                    currentThinking = thoughtMatch[1]
                        .replace(/<\/?(?:thought|thought_process)>/gi, "")
                        .replace(/```thought/gi, "")
                        .replace(/```/gi, "")
                        .trim();
                    setDiagnosis(prev => prev ? { ...prev, thinking: currentThinking } : {
                        thinking: currentThinking,
                        diagnosis: "",
                        trade: "",
                        action_required: "",
                        estimated_cost: ""
                    });
                }

                // 2. Extract JSON
                const jsonMatch = fullText.match(/<(?:json|diagnosis_data)>([\s\S]*?)(?:\s*<\/(?:json|diagnosis_data)>|$)/i);
                if (jsonMatch) {
                    let cleaned = jsonMatch[1].trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
                    try {
                        let toParse = cleaned;
                        const isComplete = fullText.toLowerCase().includes("</json>") || fullText.toLowerCase().includes("</diagnosis_data>");
                        if (!isComplete && !cleaned.endsWith("}")) {
                            const lastBrace = cleaned.lastIndexOf("}");
                            if (lastBrace !== -1) toParse = cleaned.substring(0, lastBrace + 1);
                        }

                        const parsedJson = JSON.parse(toParse);
                        if (parsedJson.diagnosis) {
                            const assistantContent = parsedJson.message || (parsedJson.diagnosis + "\n\n" + parsedJson.action_required);
                            
                            const clean = (s: string | undefined) => (s || "").trim().toLowerCase();
                            const hasChanged = 
                                clean(previousDiagnosis?.diagnosis) !== clean(parsedJson.diagnosis) ||
                                clean(previousDiagnosis?.trade) !== clean(parsedJson.trade);

                            setMessages(prev => {
                                const next = [...prev];
                                next[next.length - 1] = { 
                                    ...next[next.length - 1], 
                                    content: assistantContent,
                                    hasUpdatedDiagnosis: hasChanged
                                };
                                return next;
                            });

                            const prevTrade = diagnosis?.trade;
                            const diag = { thinking: currentThinking, ...parsedJson };
                            setDiagnosis(diag);

                            const userAskedForProviders = lastUserMsg.content.toLowerCase().match(/provider|contact|who/);
                            if (parsedJson.trade && (parsedJson.trade !== prevTrade || providers.length === 0 || userAskedForProviders)) {
                                getCurrentLocation(parsedJson.trade);
                            }

                            if (isComplete) {
                                await saveConversation({ diag });
                                saveMessage("assistant", assistantContent, [], hasChanged);
                            }
                        }
                    } catch (e) {}
                }
            }
        } catch (err) {
            console.error("Regeneration failed:", err);
        } finally {
            setIsResponding(false);
        }
    };

    const handleRetryDiagnosis = () => {
        if (!imageSrc) return;
        diagnosisStartedRef.current = false;
        setHasStartedDiagnosis(false);
        setDiagnosis(null);
        // The useEffect will pick it up
    };

    // --- Components: Header & Layout ---

    if (!isLoaded && !imageSrc) {
        return (
            <div className="flex min-h-screen flex-col">
                <AppHeader diagnosis={diagnosis} router={router} />
                <div className="flex flex-1 items-center justify-center">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!imageSrc) {
        return <NoImageFallback router={router} diagnosis={diagnosis} />;
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AppHeader diagnosis={diagnosis} router={router} />

            <main className="flex flex-1 flex-col">
                <div className="max-w-3xl mx-auto w-full px-4 py-4">
                    <div className="flex gap-4 items-start">
                        <div className="flex flex-col gap-3 w-full">
                            
                            {/* Diagnosis Section: Image & Initial Analysis */}
                            <div ref={diagnosisRef} className="flex-shrink-0 w-full sm:w-1/2 md:w-2/5 relative scroll-mt-20">
                                <div className="rounded-lg overflow-hidden border border-border/50">
                                    <img src={imageSrc} alt="Issue" className="w-full h-auto max-h-[60vh] object-cover" />
                                </div>
                            </div>

                            <div className="text-sm text-muted-foreground italic leading-relaxed min-h-[1.25rem] flex items-center">
                                {diagnosis?.thinking || (isDiagnosing && <Skeleton className="h-3.5 w-[250px]" />)}
                            </div>

                            <div className="mt-4 flex flex-col gap-2">
                                {isDiagnosing || !diagnosis?.diagnosis ? (
                                    <DiagnosisSkeleton />
                                ) : (
                                    <DiagnosisReport diagnosis={diagnosis} />
                                )}

                                {/* Providers Section: Cards Grid */}
                                {diagnosis && (
                                    <div className="mt-8 flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <Separator className="w-full" />
                                        
                                        <div className="flex flex-col gap-2">
                                            <h3 className="text-lg font-semibold flex items-center gap-2">Recommended Service Providers</h3>
                                            <p className="text-sm leading-relaxed text-muted-foreground">
                                                I found these highly-rated {diagnosis?.trade && diagnosis.trade !== 'N/A' ? diagnosis.trade : "service"} providers within 25km of your location.
                                            </p>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {isLoadingProviders ? (
                                                <ProvidersSkeleton />
                                            ) : providers.length === 0 ? (
                                                <div className="col-span-full py-12 text-center text-muted-foreground">No providers found in your area.</div>
                                            ) : (
                                                providers.map((p, i) => (
                                                    <ProviderCard key={i} provider={p} index={i} openPopoverId={openPopoverId} setOpenPopoverId={setOpenPopoverId} trade={diagnosis?.trade} userLocation={userLocation} />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Chat Interface: Message History */}
                                <div className="flex flex-col gap-4">
                                    {messages.map((msg, i) => (
                                        <ChatMessage 
                                            key={i} 
                                            message={msg} 
                                            isLast={i === messages.length - 1} 
                                            isResponding={isResponding}
                                            onFeedback={(type) => handleMessageFeedback(i, type)}
                                            onCopy={() => handleCopy(msg.content)}
                                            onRegenerate={() => handleRegenerate(i)}
                                            onScrollToDiagnosis={scrollToDiagnosis}
                                        />
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <ChatFooter 
                message={message}
                setMessage={setMessage}
                attachments={attachments}
                handleSend={handleSend}
                handleFilesChosen={handleFilesChosen}
                removeAttachment={removeAttachment}
                isDiagnosing={isDiagnosing}
                isResponding={isResponding}
                hasDiagnosis={!!diagnosis}
                fileInputRef={fileInputRef}
            />
        </div>
    );
}

// --- Sub-Components ---

/**
 * Standard app header with dynamic diagnosis title and user avatar.
 */
function AppHeader({ diagnosis, router }: { diagnosis: DiagnosisData | null, router: any }) {
    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto px-4 md:px-12 py-4 flex items-center justify-between gap-4">
                <h1 className="text-lg font-semibold truncate flex-1 min-w-0">{diagnosis?.diagnosis || "Conversation Name"}</h1>
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="size-8 rounded-full bg-secondary cursor-pointer hover:bg-secondary/80 transition-colors" />
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-3" align="end">
                        <div className="flex flex-col gap-2">
                            <Button variant="ghost" className="justify-start font-normal" onClick={() => router.push("/settings")}>Settings</Button>
                            <Button variant="ghost" className="justify-start font-normal" onClick={() => console.log("Logout clicked")}>Log Out</Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </header>
    );
}

/**
 * Displays the structured AI diagnosis and recommended actions.
 */
function DiagnosisReport({ diagnosis }: { diagnosis: DiagnosisData | null }) {
    if (!diagnosis?.diagnosis) return null;
    return (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
            <h2 className="text-xl font-semibold">{diagnosis.diagnosis}</h2>
            <div className="mt-3 space-y-4">
                <p className="text-sm text-foreground/90">{diagnosis.action_required}</p>
                <p className="text-sm font-medium text-foreground/80">{diagnosis.estimated_cost}</p>
            </div>
        </div>
    );
}

/**
 * Displays service badges in a single line with smart truncation.
 * Hides services that would be truncated by more than 25%.
 */
function ServiceBadges({ services, trade, isOpen, providerName }: { services: any[]; trade?: string; isOpen?: boolean | null; providerName?: string }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Normalize services to handle legacy string data or missing properties
    const normalizedServices = useMemo(() => {
        interface ExtendedService {
            short: string;
            full: string;
            isStatus?: boolean;
        }

        const base: ExtendedService[] = (services || []).map(s => {
            if (typeof s === 'string') return { short: s.slice(0, 15), full: s };
            return {
                short: s?.short || s?.full?.slice(0, 15) || "Service",
                full: s?.full || s?.short || "Service"
            };
        });

        if (isOpen !== undefined && isOpen !== null) {
            base.unshift({
                short: isOpen ? "Open" : "Closed",
                full: isOpen ? "Currently Open" : "Currently Closed",
                isStatus: true
            });
        }
        return base;
    }, [services, isOpen]);

    const [visibleCount, setVisibleCount] = useState(normalizedServices.length);

    // Filter/Sort services based on trade if provided
    const sortedServices = useMemo(() => {
        let base = [...normalizedServices];
        if (!trade) return base;
        const normalizedTrade = trade.toLowerCase();
        
        return base.sort((a, b) => {
            // Always keep status at the front
            if (a.isStatus && !b.isStatus) return -1;
            if (!a.isStatus && b.isStatus) return 1;
            
            const aMatch = a.full.toLowerCase().includes(normalizedTrade);
            const bMatch = b.full.toLowerCase().includes(normalizedTrade);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [normalizedServices, trade]);

    useEffect(() => {
        const calculateVisible = () => {
            if (!containerRef.current) return;
            const parent = containerRef.current.closest('.flex-col.gap-2');
            if (!parent) return;
            
            const style = window.getComputedStyle(parent);
            // Safety margin: 12px for padding and potential rounding errors
            const containerWidth = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 12;
            
            if (containerWidth <= 0) return;

            const moreBadgeWidth = 50; 
            let currentLine = 1;
            let currentLineWidth = 0;
            let count = 0;
            const gap = 8;

            const measureSpan = document.createElement("span");
            measureSpan.style.visibility = "hidden";
            measureSpan.style.position = "absolute";
            measureSpan.style.whiteSpace = "nowrap";
            measureSpan.style.font = "600 12px sans-serif"; 
            document.body.appendChild(measureSpan);

            for (let i = 0; i < sortedServices.length; i++) {
                measureSpan.innerText = sortedServices[i].short;
                const badgeWidth = measureSpan.offsetWidth + 16; 
                const remainingItems = sortedServices.length - (i + 1);

                let potentialWidth = currentLineWidth + (currentLineWidth > 0 ? gap : 0) + badgeWidth;
                const neededWithMore = potentialWidth + (remainingItems > 0 ? gap + moreBadgeWidth : 0);

                if (neededWithMore <= containerWidth) {
                    currentLineWidth = potentialWidth;
                    count++;
                } else {
                    // Truncation check: Can we show at least 75% of this badge AND is it at least 40px?
                    const availableWidth = containerWidth - currentLineWidth - (currentLineWidth > 0 ? gap : 0) - (remainingItems > 0 ? gap + moreBadgeWidth : 0);
                    if (availableWidth >= badgeWidth * 0.75 && availableWidth > 40) {
                        count++;
                    }
                    break;
                }
            }

            document.body.removeChild(measureSpan);
            setVisibleCount(Math.max(1, count));
        };

        const timer = setTimeout(calculateVisible, 100);
        window.addEventListener("resize", calculateVisible);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", calculateVisible);
        };
    }, [sortedServices, trade]);

    const visibleServices = sortedServices.slice(0, visibleCount);
    const hiddenServices = sortedServices.slice(visibleCount).filter(s => !s.isStatus);

    return (
        <div ref={containerRef} className="flex flex-row items-center gap-2 w-full min-w-0 overflow-hidden h-7 pr-1">
            {visibleServices.map((service, i) => (
                <Badge 
                    key={i} 
                    variant={service.isStatus ? "default" : "secondary"} 
                    className="whitespace-nowrap truncate min-w-0 flex-shrink-1 h-6 max-w-[150px] font-medium"
                    title={service.full}
                >
                    {service.short}
                </Badge>
            ))}
            {hiddenServices.length > 0 && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Badge 
                            variant="outline" 
                            className="cursor-pointer whitespace-nowrap transition-colors border-dotted border-2 flex-shrink-0 h-6"
                            onMouseEnter={() => setOpen(true)}
                            onMouseLeave={() => setOpen(false)}
                        >
                            +{hiddenServices.length}
                        </Badge>
                    </PopoverTrigger>
                    <PopoverContent 
                        className="w-72 p-3 shadow-xl rounded-md border-input" 
                        side="top" 
                        align="end"
                        onMouseEnter={() => setOpen(true)}
                        onMouseLeave={() => setOpen(false)}
                    >
                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-semibold capitalised text-muted-foreground truncate">
                                {providerName ? (providerName.length > 25 ? providerName.substring(0, 22) + "..." : providerName) : "All"}'s Services
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {sortedServices.filter(s => !s.isStatus).map((service, i) => (
                                    <Badge key={i} variant="secondary">
                                        {service.full}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

/**
 * Individual provider card with contact, website, and directions.
 */
function ProviderCard({ provider, index, openPopoverId, setOpenPopoverId, trade, userLocation }: { 
    provider: Provider, index: number, openPopoverId: string | null, setOpenPopoverId: (id: string | null) => void, trade?: string, userLocation?: { lat: number, lng: number } | null 
}) {
    if (!provider) return null;
    const popoverId = `contact-${index}`;
    const displayName = provider.name.replace(/\band\b/gi, "&");

    // Calculate distance if coordinates are available (fallback to Haversine if API driving distance missing)
    const distance = useMemo(() => {
        if (provider.distanceText) return provider.distanceText;
        if (!userLocation || !provider.latitude || !provider.longitude) return null;
        
        const R = 6371; // Radius of the Earth in km
        const dLat = (provider.latitude - userLocation.lat) * Math.PI / 180;
        const dLon = (provider.longitude - userLocation.lng) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(provider.latitude * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        return d.toFixed(1);
    }, [userLocation, provider.latitude, provider.longitude]);

    return (
        <Card className="flex flex-col h-full border-input shadow-none p-4 rounded-lg">
            <CardHeader className="flex flex-col gap-3 p-0">
                <div className="flex flex-col gap-2 w-full min-w-0">
                    <div className="flex justify-between items-center gap-2 w-full min-w-0">
                        <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg font-semibold truncate" title={displayName}>{displayName}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <StarFill className="size-4 text-yellow-500 fill-yellow-500" />
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold">{provider.rating?.toFixed(1) || "N/A"}</span>
                                <span className="text-xs text-muted-foreground">({provider.ratingCount || 0})</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <ServiceBadges services={provider.services || []} trade={trade} isOpen={provider.isOpen} providerName={provider.name} />
                    </div>
                </div>
            </CardHeader>
            <div className="flex items-center gap-1 w-full text-xs text-muted-foreground min-w-0">
                <span className="truncate min-w-0" title={provider.address}>{provider.address}</span>
                {distance && <span className="flex-none whitespace-nowrap"> • {distance} km</span>}
            </div>
            <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Customer Summary</p>
                <blockquote className="border-l-2 border-input pl-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {provider.summary}
                    </p>
                </blockquote>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
                <Popover open={openPopoverId === popoverId} onOpenChange={(open) => setOpenPopoverId(open ? popoverId : null)}>
                    <PopoverTrigger asChild>
                        <Button variant="default" className="flex-1">Contact</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3 rounded-md shadow-xl border-input" align="start" side="top">
                        <div className="flex flex-col gap-1">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">Recommended</p>
                            <Button variant="secondary" className="justify-start w-full">Send Summary</Button>

                            {/* <p className="text-xs text-muted-foreground py-1">Lorem ipsum dolor sit amet consectetur adipisicing elit.</p> */}
                            
                            <Separator className="my-2" />

                            {provider.phone && (
                                <Button variant="ghost" className="justify-start w-full" asChild>
                                    <a href={`tel:${provider.phone}`} className="flex items-center justify-between w-full mb-1">Immediate Assistance</a></Button>
                            )}
                            <Button variant="ghost" className="justify-start" onClick={() => window.open(`mailto:info@${provider.name.toLowerCase().replace(/\s+/g, "")}.com`)}>Request Quote</Button>
                        </div>
                    </PopoverContent>

                    {/*
                    <PopoverContent className="w-48 p-2 rounded-md shadow-xl border-input" align="start" side="top">
                        <div className="flex flex-col gap-1">
                            {provider.phone && (
                                <Button variant="ghost" className="justify-start" asChild><a href={`tel:${provider.phone}`}>Call</a></Button>
                            )}
                            <Button variant="ghost" className="justify-start" onClick={() => window.open(`mailto:info@${provider.name.toLowerCase().replace(/\s+/g, "")}.com`)}>Email</Button>
                        </div>
                    </PopoverContent>
                    */}
                </Popover>
                {provider.website && (
                    <Button variant="secondary" className="flex-1" onClick={() => window.open(provider.website, "_blank")}>Website</Button>
                )}
                <Button variant="secondary" className="flex-1" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(provider.address)}`, "_blank")}>Directions</Button>
            </div>
        </Card>
    );
}

/**
 * A single chat message bubble (User or AI).
 */
function ChatMessage({ message, isLast, isResponding, onFeedback, onCopy, onRegenerate, onScrollToDiagnosis }: { 
    message: Message, isLast: boolean, isResponding: boolean, onFeedback: (type: "up" | "down") => void, onCopy: () => void, onRegenerate: () => void, onScrollToDiagnosis: () => void 
}) {
    return (
        <div className={cn("flex flex-col gap-2 w-full mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300", message.role === "user" ? "items-end" : "items-start")}>
            {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1">
                    {message.attachments.map((src, i) => (
                        <img key={i} src={src} alt="Attachment" className="h-40 w-auto rounded-md object-cover border border-border/50" />
                    ))}
                </div>
            )}
            <div className={cn("text-sm leading-relaxed", message.role === "user" ? "bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 max-w-[75%]" : "text-foreground w-full")}>
                {message.content === "" && isLast && isResponding ? (
                    <div className="flex items-center py-1"><Spinner className="size-4 text-muted-foreground" /></div>
                ) : (
                    message.content
                )}
            </div>
            {message.role === "assistant" && message.content !== "" && (
                <div className="flex flex-col items-start gap-3 mt-1">
                    {message.hasUpdatedDiagnosis && (
                        <Button 
                            variant="outline" 
                            onClick={onScrollToDiagnosis}
                        >
                            View New Diagnosis
                        </Button>
                    )}
                    <div className="flex items-center gap-1 -ml-2">
                        <Button variant={message.feedback === "up" ? "secondary" : "ghost"} size="icon" className="size-8 group" onClick={() => onFeedback("up")}>
                            <ThumbsUp className={cn("size-4 transition-colors", message.feedback === "up" ? "text-black dark:text-white" : "text-muted-foreground group-hover:text-black dark:group-hover:text-white")} />
                        </Button>
                        <Button variant={message.feedback === "down" ? "secondary" : "ghost"} size="icon" className="size-8 group" onClick={() => onFeedback("down")}>
                            <ThumbsDown className={cn("size-4 transition-colors", message.feedback === "down" ? "text-black dark:text-white" : "text-muted-foreground group-hover:text-black dark:group-hover:text-white")} />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 group" onClick={onCopy}>
                            <Copy className="size-4 text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 group" onClick={onRegenerate}>
                            <RotateCcw className="size-4 text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * The sticky bottom footer containing the message input and attachments.
 */
function ChatFooter({ 
    message, setMessage, attachments, handleSend, handleFilesChosen, removeAttachment, 
    isDiagnosing, isResponding, hasDiagnosis, fileInputRef 
}: any) {
    const isDisabled = (!hasDiagnosis && isDiagnosing) || isResponding;
    
    return (
        <footer className="sticky bottom-0 z-50 bg-background">
            <div className="max-w-3xl mx-auto px-4 py-4">
                {attachments.length > 0 && (
                    <div className="flex gap-3 mb-3 overflow-x-auto py-2 scrollbar-hide">
                        {attachments.map((src: string, i: number) => (
                            <div key={i} className="relative flex-shrink-0 size-28 group/thumb rounded-md overflow-hidden border border-border">
                                <img src={src} alt="Preview" className="size-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => removeAttachment(i)} />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
                                    <X className="text-white size-6" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={isDisabled ? "Please wait..." : "Type Message..."}
                        className="min-h-[36px] md:min-h-[72px] w-full resize-none"
                        disabled={isDisabled}
                    />
                    <div className="flex justify-between items-center">
                        <div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFilesChosen(e.target.files)} />
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="size-8 group"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isDisabled || attachments.length >= 5}
                            >
                                <Paperclip className="size-4 text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white" />
                            </Button>
                        </div>
                        <Button 
                            onClick={handleSend}
                            disabled={isDisabled || (!message.trim() && attachments.length === 0)}
                        >
                            Submit
                        </Button>
                    </div>
                </div>
            </div>
        </footer>
    );
}

/**
 * Skeleton loader for the diagnosis results.
 */
function DiagnosisSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <Skeleton className="h-8 w-64 rounded-md" /> 
                <div className="space-y-2.5 pt-1">
                    <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-[97%]" /><Skeleton className="h-4 w-[98%]" /><Skeleton className="h-4 w-[94%]" /><Skeleton className="h-4 w-[45%]" />
                </div>
            </div>
            <div className="pt-2 border-t border-border/40 flex justify-between items-center">
                <div className="space-y-2">
                    <Skeleton className="h-5 w-48 mb-2" /><Skeleton className="h-4 w-64" />
                </div>
            </div>
        </div>
    );
}

/**
 * Skeleton loader for provider cards.
 */
function ProvidersSkeleton() {
    return (
        <>
            {[1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-4 animate-pulse border-input border p-4 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start">
                        <div className="h-6 w-48 bg-secondary/50 rounded-md" />
                        <div className="h-6 w-16 bg-secondary/50 rounded-md" />
                    </div>
                    <div className="flex flex-row items-center gap-2 h-7 overflow-hidden">
                        <div className="h-5 w-20 bg-secondary/50 rounded-md" />
                        <div className="h-5 w-20 bg-secondary/50 rounded-md" />
                        <div className="h-5 w-16 bg-secondary/50 rounded-md" />
                    </div>
                    <div className="h-4 w-full bg-secondary/50 rounded-md" />
                    <div className="mt-auto flex gap-2">
                        <div className="h-10 flex-1 bg-secondary/50 rounded-md" />
                        <div className="h-10 flex-1 bg-secondary/50 rounded-md" />
                        <div className="h-10 flex-1 bg-secondary/50 rounded-md" />
                    </div>
                </div>
            ))}
        </>
    );
}

/**
 * Fallback when no image is selected.
 */
function NoImageFallback({ router, diagnosis }: any) {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader diagnosis={diagnosis} router={router} />
            <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">No image found. Please go back and select an image.</p>
            </div>
        </div>
    );
}
