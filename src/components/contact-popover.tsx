'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toWhatsAppPhone, isWhatsAppCapablePhone } from '@/lib/utils';

export type ContactPopoverProps = {
    providerName: string;
    displayName: string;
    phone: string | null | undefined;
    /** Optional: open state controlled externally (for popover ID patterns). Omit for self-controlled. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Button label. Defaults to "Contact". */
    label?: string;
    /** Button class overrides */
    className?: string;
    /** Called when a lead action fires (optional) */
    onLead?: (type: 'whatsapp' | 'phone' | 'email') => void;
    /** Side the popover opens toward */
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Alignment of the popover */
    align?: 'start' | 'center' | 'end';
};

export function ContactPopover({
    providerName,
    displayName,
    phone,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    label = 'Contact',
    className,
    onLead,
    side = 'top',
    align = 'start',
}: ContactPopoverProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
    const [whatsappLoading, setWhatsappLoading] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled
        ? (v: boolean) => controlledOnOpenChange?.(v)
        : setInternalOpen;

    const rawPhone = phone;
    const waPhone = toWhatsAppPhone(rawPhone);
    const waCapable = isWhatsAppCapablePhone(rawPhone);

    const handleSendWhatsAppSummary = () => {
        if (!waCapable) return;
        setOpen(false);
        setWhatsappDialogOpen(true);
    };

    const confirmWhatsApp = async () => {
        if (!waPhone || !waCapable) return;
        setWhatsappLoading(true);
        try {
            onLead?.('whatsapp');
            window.open(`https://wa.me/${waPhone}`, '_blank');
        } finally {
            setWhatsappLoading(false);
            setWhatsappDialogOpen(false);
        }
    };

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="default" className={className}>
                        {label}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-56 p-3 rounded-md shadow-xl border-input"
                    align={align}
                    side={side}
                >
                    <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground font-semibold mb-1">
                            Recommended
                        </p>

                        {/* Send WhatsApp Summary */}
                        <Button
                            variant="secondary"
                            className="justify-start w-full"
                            onClick={handleSendWhatsAppSummary}
                            disabled={!waCapable}
                            title={
                                !waCapable && rawPhone
                                    ? "This number doesn't appear to be a mobile number — WhatsApp requires a mobile number."
                                    : undefined
                            }
                        >
                            Send WhatsApp Summary
                        </Button>

                        <Separator className="my-2" />

                        {/* Immediate Assistance / Call */}
                        {rawPhone && (
                            <Button
                                variant="ghost"
                                className="justify-start w-full mb-1"
                                asChild
                            >
                                <a
                                    href={`tel:${rawPhone}`}
                                    onClick={() => {
                                        onLead?.('phone');
                                        setOpen(false);
                                    }}
                                    className="flex items-center justify-between w-full"
                                >
                                    Immediate Assistance
                                </a>
                            </Button>
                        )}

                        {/* Request Quote */}
                        <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => {
                                onLead?.('email');
                                setOpen(false);
                                window.open(
                                    `mailto:info@${providerName.toLowerCase().replace(/\s+/g, '')}.com`
                                );
                            }}
                        >
                            Request Quote
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            {/* WhatsApp confirmation dialog */}
            <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send WhatsApp Summary</DialogTitle>
                        <DialogDescription>
                            {waCapable ? (
                                <>
                                    We&apos;ve generated a summary for{' '}
                                    <span className="font-medium">{displayName}</span>. You will
                                    open WhatsApp to send it.
                                    <blockquote className="mt-2 border-l-2 border-input pl-3 text-muted-foreground text-sm">
                                        We try to ensure all numbers are available on WhatsApp.
                                        If you&apos;re having trouble, please try phoning them
                                        directly.
                                    </blockquote>
                                </>
                            ) : (
                                <>
                                    This provider&apos;s number doesn&apos;t appear to be a mobile
                                    number. WhatsApp requires a mobile number.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmWhatsApp}
                            disabled={!waPhone || !waCapable || whatsappLoading}
                        >
                            {whatsappLoading ? 'Generating…' : 'Continue'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
