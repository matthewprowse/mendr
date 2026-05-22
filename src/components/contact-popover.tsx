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
import { resolveWhatsAppPrefill } from '@/lib/whatsapp-prefill';
import { toast } from 'sonner';

export type ContactPopoverProps = {
    providerName: string;
    displayName: string;
    phone: string | null | undefined;
    /** When set, enables the Email row with mailto: */
    email?: string | null | undefined;
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
    /**
     * Optional profile URL for WhatsApp when there is no saved report (passed to /api/whatsapp-message).
     * Defaults to window.location.href when resolving prefill.
     */
    profileUrlHint?: string;
};

export function ContactPopover({
    providerName,
    displayName,
    phone,
    email,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    label = 'Contact',
    className,
    onLead,
    side = 'top',
    align = 'start',
    profileUrlHint,
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
    const emailTrimmed = typeof email === 'string' ? email.trim() : '';
    const hasEmail = Boolean(emailTrimmed);

    const handleSendWhatsAppSummary = () => {
        if (!waCapable) return;
        setOpen(false);
        setWhatsappDialogOpen(true);
    };

    const confirmWhatsApp = async () => {
        if (!waPhone || !waCapable) return;
        setWhatsappLoading(true);
        try {
            const prefill = await resolveWhatsAppPrefill(profileUrlHint ?? '');
            const msgRes = await fetch('/api/whatsapp-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosis: prefill.diagnosis,
                    provider_name: displayName || providerName,
                    trade: prefill.trade,
                    report_url: prefill.report_url,
                    profile_url: prefill.profile_url,
                }),
            });
            const msgData = (await msgRes.json().catch(() => ({}))) as { message?: string; error?: string };
            if (!msgRes.ok || !msgData.message) {
                throw new Error(msgData.error || 'Could not generate message');
            }
            onLead?.('whatsapp');
            const text = encodeURIComponent(msgData.message);
            setWhatsappDialogOpen(false);
            window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Could not generate WhatsApp message.';
            toast.error(msg);
        } finally {
            setWhatsappLoading(false);
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

                        {waCapable ? (
                            <Button
                                variant="secondary"
                                className="justify-start w-full"
                                onClick={handleSendWhatsAppSummary}
                            >
                                Send WhatsApp summary
                            </Button>
                        ) : null}

                        {waCapable ? <Separator className="my-2" /> : null}

                        <Button
                            variant="ghost"
                            className="justify-start w-full mb-1"
                            disabled={!rawPhone?.trim()}
                            asChild={Boolean(rawPhone?.trim())}
                        >
                            {rawPhone?.trim() ? (
                                <a
                                    href={`tel:${rawPhone}`}
                                    onClick={() => {
                                        onLead?.('phone');
                                        setOpen(false);
                                    }}
                                    className="flex items-center justify-between w-full"
                                >
                                    Phone
                                </a>
                            ) : (
                                <span className="flex w-full items-center justify-start">Phone</span>
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            className="justify-start"
                            disabled={!hasEmail}
                            onClick={() => {
                                if (!hasEmail) return;
                                onLead?.('email');
                                setOpen(false);
                                window.open(`mailto:${encodeURIComponent(emailTrimmed)}`, '_blank');
                            }}
                        >
                            Email
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
                <DialogContent>
                    <DialogHeader className="text-left gap-3 sm:text-left">
                        <DialogTitle>Send WhatsApp summary</DialogTitle>
                        <DialogDescription>
                            {waCapable ? (
                                <>
                                    We&apos;ll draft a short message for{' '}
                                    <span className="font-medium">{displayName}</span> using your latest
                                    Mendr scan when available, then open WhatsApp for you to send it.
                                </>
                            ) : (
                                <>
                                    This number doesn&apos;t look like a South African mobile (WhatsApp
                                    needs a mobile number, not a landline).
                                </>
                            )}
                        </DialogDescription>
                        {waCapable ? (
                            <blockquote className="mt-1 border-l-2 border-input pl-3 text-muted-foreground text-sm">
                                Mobile numbers only — landlines can&apos;t receive WhatsApp. If something
                                fails, try calling them directly.
                            </blockquote>
                        ) : null}
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void confirmWhatsApp()}
                            disabled={!waPhone || !waCapable || whatsappLoading}
                        >
                            {whatsappLoading ? 'Preparing…' : 'Continue'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
