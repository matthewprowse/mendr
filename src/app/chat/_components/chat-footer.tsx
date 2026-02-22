'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_ATTACHMENTS = 5;

export function ChatFooter({
    message,
    setMessage,
    handleSend,
    isDiagnosing,
    isResponding,
    hasDiagnosis,
    pendingAttachments,
    onAddAttachments,
    onRemoveAttachment,
    welcomeMode = false,
    inputRef,
}: {
    message: string;
    setMessage: (v: string) => void;
    handleSend: () => void;
    isDiagnosing: boolean;
    isResponding: boolean;
    hasDiagnosis: boolean;
    pendingAttachments: string[];
    onAddAttachments: (files: File[]) => void;
    onRemoveAttachment: (index: number) => void;
    welcomeMode?: boolean;
    inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
    const internalRef = useRef<HTMLInputElement>(null);
    const fileInputRef = inputRef ?? internalRef;
    const isDisabled = (!hasDiagnosis && isDiagnosing) || isResponding;
    const canSend = welcomeMode ? false : (message.trim() || pendingAttachments.length > 0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const remaining = welcomeMode ? 1 : MAX_ATTACHMENTS - pendingAttachments.length;
        if (remaining <= 0) return;
        const toAdd = files.slice(0, remaining).filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (toAdd.length > 0) onAddAttachments(toAdd);
        e.target.value = '';
    };

    return (
        <footer className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border p-4">
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
                {!welcomeMode && pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {pendingAttachments.map((url, i) => (
                            <div
                                key={i}
                                className="relative size-14 rounded-lg overflow-hidden border border-border shrink-0 group"
                            >
                                <img
                                    src={url}
                                    alt={`Attachment ${i + 1}`}
                                    className="size-full object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemoveAttachment(i)}
                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    aria-label="Remove attachment"
                                >
                                    <X className="size-5 text-white" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2 items-end min-w-0">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple={!welcomeMode}
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <Button
                            type="button"
                            variant={welcomeMode ? 'secondary' : 'ghost'}
                            size="icon"
                            className={cn(
                                'flex-shrink-0 shrink-0',
                                welcomeMode ? 'size-10' : 'size-9'
                            )}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={
                                welcomeMode
                                    ? isResponding
                                    : isDisabled || pendingAttachments.length >= MAX_ATTACHMENTS
                            }
                            title={welcomeMode ? 'Upload photo' : `Add images (max ${MAX_ATTACHMENTS})`}
                        >
                            <Paperclip
                                className={cn(welcomeMode ? 'size-5' : 'size-4', 'text-muted-foreground')}
                            />
                        </Button>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (canSend) handleSend();
                                }
                            }}
                            placeholder={
                                welcomeMode
                                    ? isResponding
                                        ? 'Processing…'
                                        : 'Upload Images to Analyse'
                                    : isDisabled
                                      ? 'Processing...'
                                      : "Communicate with Scandio's AI Assistant"
                            }
                            disabled={isDisabled || isResponding || welcomeMode}
                            className="min-h-[4.5rem] max-h-[224px] flex-1 resize-none text-sm py-2 px-3"
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className={cn(
                                'flex-shrink-0 shrink-0',
                                welcomeMode ? 'size-10' : 'size-9'
                            )}
                            onClick={handleSend}
                            disabled={isDisabled || isResponding || !canSend}
                        >
                            <ArrowUp className={cn(welcomeMode ? 'size-5' : 'size-4')} />
                        </Button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
