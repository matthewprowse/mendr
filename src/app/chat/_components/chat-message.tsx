import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ThumbsUp, ThumbsDown, Copy, RotateCcw } from '@/lib/icons';
import { Message } from './types';
import { InlineDiagnosisBlock } from './inline-diagnosis-block';
import { UnrelatedImageCard } from './unrelated-image-card';
import { UnservicedCategoryCard } from './unserviced-category-card';
import { openInNewTab } from '@/lib/open-in-new-tab';

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
        providerRadiusKm?: number;
        onRadiusChange?: (km: number) => void;
    };
}) {
    const hasDiagnosisBlock =
        message.role === 'assistant' &&
        message.diagnosis &&
        message.diagnosis.diagnosis &&
        message.diagnosis.diagnosis !== 'N/A' &&
        !message.diagnosis.requires_clarification &&
        !message.diagnosis.rejected &&
        !message.diagnosis.unserviced &&
        (message.hasUpdatedDiagnosis !== false || (message.providers?.length ?? 0) > 0) &&
        !!inlineDiagnosisProps;

    const hasRejectedBlock =
        message.role === 'assistant' &&
        message.diagnosis?.rejected &&
        !!inlineDiagnosisProps?.conversationId;

    const hasUnservicedBlock =
        message.role === 'assistant' &&
        message.diagnosis?.unserviced &&
        !message.diagnosis?.rejected &&
        !!inlineDiagnosisProps?.conversationId;

    const isUser = message.role === 'user';
    const userContentBlock = (
        <>
            {!(
                isUser &&
                (message.content === '' || message.content === 'Sent images') &&
                (message.attachments?.length ?? 0) > 0
            ) && (
                <div
                    className={cn(
                        'text-sm leading-relaxed flex flex-col gap-2',
                        isUser
                            ? 'bg-secondary text-secondary-foreground rounded-md px-3 py-2 max-w-[90%]'
                            : 'text-foreground w-full',
                        (hasDiagnosisBlock || hasRejectedBlock || hasUnservicedBlock) && 'hidden'
                    )}
                >
                    {message.content === '' && isLast && isResponding ? (
                        <div className="flex items-center py-1">
                            <Spinner className="size-4 text-muted-foreground" />
                        </div>
                    ) : (
                        (() => {
                            if (hasDiagnosisBlock || hasRejectedBlock || hasUnservicedBlock)
                                return null;
                            let content =
                                typeof message.content === 'string'
                                    ? message.content
                                    : '';
                            if (content === '[object Object]') content = '';
                            const thinking = message.diagnosis?.thinking?.trim();
                            if (content && thinking && thinking.length > 15) {
                                if (content.trim() === thinking.trim()) content = '';
                                else if (content.includes(thinking))
                                    content = content
                                        .replace(thinking, '')
                                        .replace(/\n{3,}/g, '\n\n')
                                        .trim();
                            }
                            return content && content !== 'Sent images' ? (
                                <span>{content}</span>
                            ) : null;
                        })()
                    )}
                </div>
            )}
            {isUser && message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-end">
                    {(message.attachments as unknown[])
                        .map((a) =>
                            typeof a === 'string'
                                ? a
                                : a && typeof a === 'object' && 'url' in a
                                  ? (a as { url: string }).url
                                  : null
                        )
                        .filter((url): url is string => !!url && typeof url === 'string')
                        .map((url, i) => (
                            <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block max-w-[200px] max-h-48 rounded-lg overflow-hidden border border-border/50 hover:opacity-95 shrink-0"
                                onClick={(e) => {
                                    if (url.startsWith('data:')) {
                                        e.preventDefault();
                                        openInNewTab(url);
                                    }
                                }}
                            >
                                <img
                                    src={url}
                                    alt={`Uploaded image ${i + 1}`}
                                    className="w-full h-full max-h-48 object-cover"
                                />
                            </a>
                        ))}
                </div>
            )}
        </>
    );

    return (
        <div
            className={cn(
                'flex min-w-0 max-w-full flex-col gap-4 w-full mt-3 overflow-hidden',
                isUser ? 'items-end' : 'items-start'
            )}
        >
            {/* Unrelated image card */}
            {hasRejectedBlock && (
                <UnrelatedImageCard
                    conversationId={inlineDiagnosisProps!.conversationId}
                    diagnosisMessage={message.content}
                />
            )}
            {/* Unserviced category card */}
            {hasUnservicedBlock && message.diagnosis && (
                <UnservicedCategoryCard
                    conversationId={inlineDiagnosisProps!.conversationId}
                    requestedService={message.diagnosis.trade || 'Unknown'}
                    diagnosis={message.diagnosis.diagnosis}
                    diagnosisFull={message.diagnosis as unknown as Record<string, unknown>}
                />
            )}
            {/* Diagnosis block first so nothing appears between page-level thinking and diagnosis header */}
            {hasDiagnosisBlock && inlineDiagnosisProps && message.diagnosis && (
                <InlineDiagnosisBlock
                    conversationId={inlineDiagnosisProps.conversationId}
                    diagnosis={message.diagnosis}
                    providers={message.providers}
                    emergingProviders={message.emergingProviders}
                    nearbyOnlyProviders={message.nearbyOnlyProviders}
                    isLoadingProviders={inlineDiagnosisProps.isLoadingProviders}
                    userLocation={inlineDiagnosisProps.userLocation}
                    trade={message.diagnosis!.trade}
                    messageIndex={index}
                    openPopoverId={inlineDiagnosisProps.openPopoverId}
                    setOpenPopoverId={inlineDiagnosisProps.setOpenPopoverId}
                    onRequestLocation={inlineDiagnosisProps.onRequestLocation}
                    onAddressSelect={inlineDiagnosisProps.onAddressSelect}
                    providerRadiusKm={inlineDiagnosisProps.providerRadiusKm}
                    onRadiusChange={inlineDiagnosisProps.onRadiusChange}
                />
            )}
            {/* User messages: wrap text + attachments in one block aligned right */}
            {isUser ? (
                <div className="flex flex-col gap-2 items-end max-w-[95%] w-full">
                    {userContentBlock}
                </div>
            ) : (
                userContentBlock
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
                    <Button variant="ghost" size="icon" className="size-9 group" onClick={onCopy}>
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
