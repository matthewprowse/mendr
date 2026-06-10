'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toWhatsAppPhone } from '@/lib/utils';
import type { MatchProvider } from '@/features/match/contracts';
import type { ContactChannel } from '@/app/match/components/contact-actions';

/** Contact button + channel picker popover rendered inside each provider card. */
export function ContactPopover({
    provider,
    open,
    onOpenChange,
    onSelectChannel,
}: {
    provider: MatchProvider;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectChannel: (channel: ContactChannel) => void;
}) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full"
                    onClick={(e) => e.stopPropagation()}
                >
                    Contact
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-64 rounded-md border-input/75 p-3"
                align="start"
                side="top"
                sideOffset={4}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() => {
                                onSelectChannel('whatsapp');
                            }}
                            disabled={!toWhatsAppPhone(provider.phone)}
                        >
                            WhatsApp
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            We share your name and number with this specialist so they can help.
                            You confirm before anything is sent.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                                onSelectChannel('phone');
                            }}
                            disabled={!provider.phone}
                        >
                            Phone
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                                onSelectChannel('email');
                            }}
                            disabled={!provider.website}
                        >
                            Email
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
