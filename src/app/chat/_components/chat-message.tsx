import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ThumbUp as ThumbsUp, ThumbDown as ThumbsDown, Copy, RotateCounterClockwise as RotateCcw } from 'geist-icons';
import { Message } from './types';
import { InlineDiagnosisBlock } from './inline-diagnosis-block';

export function ChatMessage({
    message,
    index,
    isLast,
    isResponding,
    onFeedback,
    onCopy,
    onRegenerate,
    inlineDiagnosisProps,
}: {
    message: Message;
    index: number;
    isLast: boolean;
    isResponding: boolean;
    onFeedback: (type: 'up' | 'down') => void;
    onCopy: () => void;
    onRegenerate: () => void;
    inlineDiagnosisProps?: {
        conversationId?: string;
        userLocation: { lat: number; lng: number; address?: string } | null;
        isLoadingProviders?: boolean;
        openPopoverId: string | null;
        setOpenPopoverId: (id: string | null) => void;
        onRequestLocation?: (trade?: string) => void;
        onAddressSelect?: (loc: { lat: number; lng: number; address: string }) => void;
    };
}) {
    const hasDiagnosisBlock =
        message.role === 'assistant' &&
        message.diagnosis &&
        message.diagnosis.diagnosis &&
        message.diagnosis.diagnosis !== 'N/A' &&
        !message.diagnosis.requires_clarification &&
        (message.hasUpdatedDiagnosis !== false || (message.providers?.length ?? 0) > 0) &&
        !!inlineDiagnosisProps;

    return (
        <div
            className={cn(
                'flex flex-col gap-2 w-full mt-3',
                message.role === 'user' ? 'items-end' : 'items-start'
            )}
        >
                {/* Diagnosis block first so nothing appears between page-level thinking and diagnosis header */}
                {hasDiagnosisBlock && inlineDiagnosisProps && message.diagnosis && (
                    <InlineDiagnosisBlock
                            conversationId={inlineDiagnosisProps.conversationId}
                            diagnosis={message.diagnosis}
                            providers={message.providers}
                            isLoadingProviders={inlineDiagnosisProps.isLoadingProviders}
                            userLocation={inlineDiagnosisProps.userLocation}
                            trade={message.diagnosis!.trade}
                            messageIndex={index}
                            openPopoverId={inlineDiagnosisProps.openPopoverId}
                            setOpenPopoverId={inlineDiagnosisProps.setOpenPopoverId}
                            onRequestLocation={inlineDiagnosisProps.onRequestLocation}
                            onAddressSelect={inlineDiagnosisProps.onAddressSelect}
                        />
                )}
                {message.role === 'user' &&
                    message.attachments &&
                    message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                            {message.attachments.map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block h-16 w-16 rounded-lg overflow-hidden border border-border/50 hover:opacity-95 shrink-0"
                                >
                                    <img
                                        src={url}
                                        alt={`Attachment ${i + 1}`}
                                        className="h-full w-full object-cover"
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                {!(
                    message.role === 'user' &&
                    (message.content === '' || message.content === 'Sent images') &&
                    (message.attachments?.length ?? 0) > 0
                ) && (
                    <div
                        className={cn(
                            'text-sm leading-relaxed flex flex-col gap-2',
                            message.role === 'user'
                                ? 'bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 max-w-[75%]'
                                : 'text-foreground w-full',
                            hasDiagnosisBlock && 'hidden'
                        )}
                    >
                        {message.content === '' && isLast && isResponding ? (
                            <div className="flex items-center py-1">
                                <Spinner className="size-4 text-muted-foreground" />
                            </div>
                        ) : (
                            (() => {
                                if (hasDiagnosisBlock) return null;
                                let content = message.content;
                                const thinking = message.diagnosis?.thinking?.trim();
                                if (content && thinking && thinking.length > 15) {
                                    if (content.trim() === thinking.trim()) content = '';
                                    else if (content.includes(thinking)) content = content.replace(thinking, '').replace(/\n{3,}/g, '\n\n').trim();
                                }
                                return content && content !== 'Sent images' ? <span>{content}</span> : null;
                            })()
                        )}
                    </div>
                )}
                {message.role === 'assistant' && (
                    <div className="flex items-center gap-1 -ml-2 mt-1">
                            <Button
                                variant={message.feedback === 'up' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="size-9 group"
                                onClick={() => onFeedback('up')}
                            >
                                <ThumbsUp
                                    className={cn(
                                        'size-4 transition-colors',
                                        message.feedback === 'up'
                                            ? 'text-black dark:text-white'
                                            : 'text-muted-foreground group-hover:text-black dark:group-hover:text-white'
                                    )}
                                />
                            </Button>
                            <Button
                                variant={message.feedback === 'down' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="size-9 group"
                                onClick={() => onFeedback('down')}
                            >
                                <ThumbsDown
                                    className={cn(
                                        'size-4 transition-colors',
                                        message.feedback === 'down'
                                            ? 'text-black dark:text-white'
                                            : 'text-muted-foreground group-hover:text-black dark:group-hover:text-white'
                                    )}
                                />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 group"
                                onClick={onCopy}
                            >
                                <Copy className="size-4 text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 group"
                                onClick={onRegenerate}
                            >
                                <RotateCcw className="size-4 text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white" />
                            </Button>
                        </div>
                )}
        </div>
    );
}
