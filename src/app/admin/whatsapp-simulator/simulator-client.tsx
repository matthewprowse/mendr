'use client';

/**
 * WhatsApp conversation simulator UI (Phase A5).
 *
 * Centred at `mx-auto max-w-xl px-4` (phone width). Three zones: a fixed
 * header (Simulating-as dropdown + Show-payload toggle), a scrollable chat
 * history, and a fixed footer input (Textarea + up-to-4 image upload).
 *
 * Inbound (simulated user) bubbles right-aligned; outbound (bot) bubbles
 * left-aligned. A three-dot loading bubble shows while the pipeline runs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

const GUEST_VALUE = 'guest';

interface ProfileOption {
    id: string;
    name: string;
    locationCount: number;
}

interface ChatBubble {
    id: string;
    direction: 'inbound' | 'outbound';
    text: string;
    images?: string[];
}

interface SimulatorResponse {
    messages: { text: string }[];
    state: string;
    session: unknown;
}

/** Render plain text with tappable links. */
function renderWithLinks(text: string) {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
            <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="underline break-all"
            >
                {part}
            </a>
        ) : (
            <span key={i}>{part}</span>
        ),
    );
}

export function WhatsappSimulator() {
    const [profiles, setProfiles] = useState<ProfileOption[]>([]);
    const [from, setFrom] = useState<string>(GUEST_VALUE);
    const [showPayload, setShowPayload] = useState(false);
    const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
    const [input, setInput] = useState('');
    const [pendingImages, setPendingImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastPayload, setLastPayload] = useState<unknown>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch('/api/whatsapp/simulator/profiles')
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d?.profiles)) setProfiles(d.profiles);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [bubbles, loading]);

    // Reset the chat when switching the simulated user.
    useEffect(() => {
        setBubbles([]);
        setLastPayload(null);
    }, [from]);

    const addBubble = useCallback((b: Omit<ChatBubble, 'id'>) => {
        setBubbles((prev) => [
            ...prev,
            { ...b, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ]);
    }, []);

    const onPickFiles = useCallback((files: FileList | null) => {
        if (!files) return;
        const remaining = 4 - pendingImages.length;
        const slice = Array.from(files).slice(0, Math.max(0, remaining));
        slice.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    setPendingImages((prev) =>
                        prev.length >= 4 ? prev : [...prev, reader.result as string],
                    );
                }
            };
            reader.readAsDataURL(file);
        });
    }, [pendingImages.length]);

    const send = useCallback(async () => {
        const text = input.trim();
        const images = pendingImages;
        if (!text && images.length === 0) return;
        if (loading) return;

        addBubble({ direction: 'inbound', text, images });
        setInput('');
        setPendingImages([]);
        setLoading(true);

        try {
            const res = await fetch('/api/whatsapp/simulator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from,
                    text: text || undefined,
                    imageDataUri: images.length > 0 ? images : undefined,
                }),
            });
            const data = (await res.json()) as SimulatorResponse & { error?: string };
            setLastPayload(data);
            if (!res.ok) {
                addBubble({
                    direction: 'outbound',
                    text: data?.error || 'The bot failed to respond.',
                });
            } else {
                for (const m of data.messages ?? []) {
                    addBubble({ direction: 'outbound', text: m.text });
                }
            }
        } catch {
            addBubble({
                direction: 'outbound',
                text: 'Network error talking to the bot.',
            });
        } finally {
            setLoading(false);
        }
    }, [input, pendingImages, loading, from, addBubble]);

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
            }
        },
        [send],
    );

    return (
        <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-xl flex-col px-4">
            {/* Header */}
            <div className="flex shrink-0 flex-col gap-2 border-b py-3">
                <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium" htmlFor="sim-as">
                        Simulating as
                    </label>
                    <NativeSelect
                        id="sim-as"
                        className="max-w-[16rem]"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    >
                        <NativeSelectOption value={GUEST_VALUE}>
                            Guest, unregistered
                        </NativeSelectOption>
                        {profiles.map((p) => (
                            <NativeSelectOption key={p.id} value={p.id}>
                                {p.name}
                                {p.locationCount > 0
                                    ? ` (${p.locationCount} address${p.locationCount > 1 ? 'es' : ''})`
                                    : ''}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Show payload</span>
                    <Switch checked={showPayload} onCheckedChange={setShowPayload} />
                </div>
            </div>

            {/* Chat history */}
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto py-4">
                {bubbles.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Send a photo of a problem or describe what is wrong to start.
                    </p>
                )}
                {bubbles.map((b) => (
                    <div
                        key={b.id}
                        className={cn(
                            'flex',
                            b.direction === 'inbound' ? 'justify-end' : 'justify-start',
                        )}
                    >
                        <div
                            className={cn(
                                'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                                b.direction === 'inbound'
                                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                                    : 'rounded-bl-sm bg-muted text-foreground',
                            )}
                        >
                            {b.images && b.images.length > 0 && (
                                <div className="mb-1 flex flex-wrap gap-1">
                                    {b.images.map((src, i) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={i}
                                            src={src}
                                            alt="attachment"
                                            className="h-16 w-16 rounded object-cover"
                                        />
                                    ))}
                                </div>
                            )}
                            {b.text && renderWithLinks(b.text)}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-foreground">
                            <span className="flex gap-1">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" />
                            </span>
                        </div>
                    </div>
                )}

                {showPayload && lastPayload != null && (
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                        {JSON.stringify(lastPayload, null, 2)}
                    </pre>
                )}
            </div>

            {/* Footer input */}
            <div className="shrink-0 border-t py-3">
                {pendingImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                        {pendingImages.map((src, i) => (
                            <div key={i} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={src}
                                    alt="pending"
                                    className="h-14 w-14 rounded object-cover"
                                />
                                <button
                                    type="button"
                                    aria-label="Remove image"
                                    onClick={() =>
                                        setPendingImages((prev) =>
                                            prev.filter((_, idx) => idx !== i),
                                        )
                                    }
                                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs text-background"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            onPickFiles(e.target.files);
                            e.target.value = '';
                        }}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Attach images"
                        disabled={pendingImages.length >= 4}
                        onClick={() => fileRef.current?.click()}
                    >
                        📎
                    </Button>
                    <Textarea
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Type a message…"
                        className="max-h-24 min-h-0 flex-1 resize-none"
                    />
                    <Button
                        type="button"
                        onClick={() => void send()}
                        disabled={loading || (!input.trim() && pendingImages.length === 0)}
                    >
                        Send
                    </Button>
                </div>
            </div>
        </div>
    );
}
