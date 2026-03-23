'use client';

import { forwardRef, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Paperclip, Cross } from '@/lib/icons';
import { cn } from '@/lib/utils';

const MAX_ATTACHMENTS = 5;

export const ChatFooter = forwardRef<
    HTMLElement,
    {
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
    }
>(
    (
        {
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
        },
        ref
    ) => {
        const internalRef = useRef<HTMLInputElement>(null);
        const fileInputRef = inputRef ?? internalRef;
        const isDisabled = (!hasDiagnosis && isDiagnosing) || isResponding;
        const canSend =
            (welcomeMode && message.trim().length > 0) ||
            (!welcomeMode && (message.trim().length > 0 || pendingAttachments.length > 0));

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            const remaining = welcomeMode ? 1 : MAX_ATTACHMENTS - pendingAttachments.length;
            if (remaining <= 0) return;
            const toAdd = files
                .slice(0, remaining)
                .filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
            if (toAdd.length > 0) onAddAttachments(toAdd);
            e.target.value = '';
        };

        // Welcome mode: only show upload button (no textarea) until the user has uploaded the first image.
        if (welcomeMode) {
            return (
                <footer
                    ref={ref}
                    className="sticky bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur px-4 py-3"
                >
                    <div className="max-w-5xl px-0 md:px-4 mx-auto w-full flex flex-col gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple={false}
                            className="hidden"
                            onChange={handleFileChange}
                        />

                        <div className="flex items-center justify-start">
                            <Button
                                type="button"
                                variant="default"
                                className="inline-flex items-center w-full"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isResponding}
                            >
                                <span className="text-sm">Upload Image</span>
                            </Button>
                        </div>
                    </div>
                </footer>
            );
        }

        const handlePaste = (e: React.ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (
                    item.kind === 'file' &&
                    (item.type.startsWith('image/') || item.type.startsWith('video/'))
                ) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }
            if (imageFiles.length > 0) {
                const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
                const toAdd = imageFiles.slice(0, Math.max(0, remaining));
                if (toAdd.length > 0) onAddAttachments(toAdd);
            }
        };

        const handleDrop = (e: React.DragEvent) => {
            const files = Array.from(e.dataTransfer?.files || []);
            const imageFiles = files.filter(
                (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
            );
            if (imageFiles.length > 0) {
                e.preventDefault();
                const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
                const toAdd = imageFiles.slice(0, Math.max(0, remaining));
                if (toAdd.length > 0) onAddAttachments(toAdd);
            }
        };

        const handleDragOver = (e: React.DragEvent) => {
            if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
        };

        return (
            <footer
                ref={ref}
                className="sticky bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur px-4 py-3"
            >
                <div className="max-w-5xl px-0 md:px-4 mx-auto w-full flex flex-col gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <div
                        className="relative flex-1 min-w-0 rounded-md border border-input bg-transparent shadow-xs min-h-[4.5rem] max-h-[224px] flex flex-col focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 transition-[color,box-shadow] outline-none"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    >
                        {pendingAttachments.length > 0 && (
                            <div className="px-3 pt-3 pb-1.5 flex flex-wrap gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
                                {pendingAttachments
                                    .map((url, i) =>
                                        typeof url === 'string' ? { url, i } : null
                                    )
                                    .filter((x): x is { url: string; i: number } => x !== null)
                                    .map(({ url, i }) => (
                                        <div
                                            key={i}
                                            className="relative size-16 rounded-lg overflow-hidden border border-border shrink-0 group"
                                        >
                                            {url.startsWith('data:video/') ? (
                                                <video
                                                    src={url}
                                                    className="h-full w-full object-cover"
                                                    muted
                                                    playsInline
                                                />
                                            ) : (
                                                <img
                                                    src={url}
                                                    alt={`Attachment ${i + 1}`}
                                                    className="h-full w-full object-cover"
                                                />
                                            )}
                                            <Button
                                                onClick={() => onRemoveAttachment(i)}
                                                size="icon"
                                                variant="secondary"
                                                className="absolute h-6 w-6 top-1 right-1 p-0.5 text-black rounded-md"
                                                aria-label="Remove Attachment"
                                            >
                                                <Cross className="size-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                            </div>
                        )}
                        <div className="relative flex-1 min-w-0 flex">
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onPaste={handlePaste}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (canSend) handleSend();
                                    }
                                }}
                                placeholder={
                                    isDisabled
                                        ? 'Processing...'
                                        : 'Ask a follow-up or add details…'
                                }
                                disabled={isDisabled || isResponding}
                                className={cn(
                                    'min-h-[4.5rem] max-h-48 flex-1 resize-none overflow-y-auto text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none rounded-b-md pr-20 pb-12',
                                    'field-sizing-fixed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                                )}
                            />
                            <div className="absolute bottom-2 right-2 flex gap-2 shrink-0">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={
                                        isDisabled ||
                                        isResponding ||
                                        pendingAttachments.length >= MAX_ATTACHMENTS
                                    }
                                    title={`Add images or videos (Max ${MAX_ATTACHMENTS})`}
                                >
                                    <Paperclip strokeWidth={2} className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="flex-shrink-0 shrink-0 size-9 text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={handleSend}
                                    disabled={isDisabled || isResponding || !canSend}
                                >
                                    <ArrowUp
                                        strokeWidth={2}
                                        className="size-4"
                                    />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        );
    }
);
ChatFooter.displayName = 'ChatFooter';
