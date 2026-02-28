import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { StarFill } from '@/lib/icons';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Provider, type Service } from './types';
import { toWhatsAppPhone, isWhatsAppCapablePhone, formatBusinessName } from '@/lib/utils';
import { FavouriteButton } from '@/components/favourite-button';

function toTitleCase(s: string): string {
    return s
        .replace(/_/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/** Shorten summary and remove leading provider name (2–3 sentences max). */
function formatCustomerSummary(summary: string, providerName: string): string {
    if (!summary?.trim()) return summary || '';
    let text = summary.trim();
    const name = (providerName || '').trim();
    if (name) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        text = text.replace(new RegExp(`^${escaped}[\\s.,]+`, 'i'), '').trim();
    }
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length <= 3) return text;
    return sentences.slice(0, 3).join(' ').trim();
}

const VISIBLE_BADGE_COUNT = 3;

function ServiceBadges({
    services,
    trade,
    isOpen,
    providerName,
}: {
    services: (Service | string)[];
    trade?: string;
    isOpen?: boolean | null;
    providerName?: string;
}) {
    const [open, setOpen] = useState(false);

    const normalizedServices = useMemo(() => {
        interface ExtendedService {
            full: string;
            isStatus?: boolean;
        }

        const base: ExtendedService[] = (services || []).map((s) => ({
            full: toTitleCase(typeof s === 'string' ? s : s?.full || s?.short || 'Service'),
        }));

        if (isOpen !== undefined && isOpen !== null) {
            base.unshift({
                full: isOpen ? 'Open' : 'Closed',
                isStatus: true,
            });
        }
        return base;
    }, [services, isOpen]);

    const sortedServices = useMemo(() => {
        const base = [...normalizedServices];
        if (!trade) return base;
        const normalizedTrade = trade.toLowerCase();

        return base.sort((a, b) => {
            if (a.isStatus && !b.isStatus) return -1;
            if (!a.isStatus && b.isStatus) return 1;

            const aMatch = a.full.toLowerCase().includes(normalizedTrade);
            const bMatch = b.full.toLowerCase().includes(normalizedTrade);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [normalizedServices, trade]);

    const visibleServices = sortedServices.slice(0, VISIBLE_BADGE_COUNT);
    const hiddenServices = sortedServices.slice(VISIBLE_BADGE_COUNT).filter((s) => !s.isStatus);

    return (
        <div className="flex flex-row items-center gap-2 w-full min-w-0 overflow-hidden h-7">
            {visibleServices.map((service, i) => (
                <Badge
                    key={i}
                    variant={service.isStatus ? 'default' : 'secondary'}
                    className="min-w-0 h-6 font-medium justify-start"
                    style={{ flexShrink: i === visibleServices.length - 1 ? 1 : 0 }}
                    title={service.full}
                >
                    <span className="truncate">{service.full}</span>
                </Badge>
            ))}
            {hiddenServices.length > 0 && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Badge
                            variant="outline"
                            className="cursor-pointer whitespace-nowrap transition-colors border-dotted border-2 shrink-0 h-6"
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
                                {providerName
                                    ? providerName.length > 25
                                        ? providerName.substring(0, 22) + '...'
                                        : providerName
                                    : 'All'}
                                &apos;s Services
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {sortedServices
                                    .filter((s) => !s.isStatus)
                                    .map((service, i) => (
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

export function ProviderCard({
    provider,
    index,
    diagnosis,
    conversationId,
    openPopoverId,
    setOpenPopoverId,
    trade,
    userLocation,
}: {
    provider: Provider;
    index: number;
    diagnosis?: {
        diagnosis: string;
        trade?: string;
        action_required?: string;
        estimated_cost?: string;
    } | null;
    conversationId?: string;
    openPopoverId: string | null;
    setOpenPopoverId: (id: string | null) => void;
    trade?: string;
    userLocation?: { lat: number; lng: number } | null;
}) {
    const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
    const [whatsappLoading, setWhatsappLoading] = useState(false);
    const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

    // Calculate distance if coordinates are available (fallback to Haversine if API driving distance missing)
    const distance = useMemo(() => {
        if (!provider) return null;
        if (provider.distanceText) return provider.distanceText;
        if (!userLocation || !provider.latitude || !provider.longitude) return null;

        const R = 6371; // Radius of the Earth in km
        const dLat = ((provider.latitude - userLocation.lat) * Math.PI) / 180;
        const dLon = ((provider.longitude - userLocation.lng) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((userLocation.lat * Math.PI) / 180) *
                Math.cos((provider.latitude * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        return d.toFixed(1);
    }, [provider, userLocation]);

    if (!provider) return null;
    const popoverId = `contact-${index}`;
    const displayName = formatBusinessName(provider.name);
    const rawPhone = provider.phoneInternational || provider.phone;
    const waPhone = toWhatsAppPhone(rawPhone);
    const waCapable = isWhatsAppCapablePhone(rawPhone);

    const logLead = async (contactType: 'whatsapp' | 'phone' | 'email') => {
        try {
            await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversationId || null,
                    provider_place_id: provider.place_id,
                    provider_name: provider.name,
                    contact_type: contactType,
                }),
            });
        } catch (_e) {}
    };

    const handleSendWhatsAppSummary = () => {
        if (!waCapable) return;
        setContactPopoverOpen(false);
        setOpenPopoverId(null);
        setWhatsappDialogOpen(true);
    };

    const confirmWhatsAppSummary = async () => {
        if (!diagnosis?.diagnosis || !waPhone || !waCapable) return;
        setWhatsappLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
            const reportUrl = conversationId ? `${baseUrl}/report/${conversationId}` : '';

            const msgRes = await fetch('/api/whatsapp-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosis: diagnosis.diagnosis,
                    provider_name: provider.name,
                    trade: diagnosis.trade,
                    action_required: diagnosis.action_required,
                    estimated_cost: diagnosis.estimated_cost,
                    report_url: reportUrl || '',
                }),
            });

            const msgData = await msgRes.json();

            if (!msgRes.ok || !msgData.message) {
                throw new Error(msgData.error || 'Could not generate message');
            }

            const fullMessage = msgData.message as string;

            logLead('whatsapp');
            const text = encodeURIComponent(fullMessage);
            setWhatsappLoading(false);
            setWhatsappDialogOpen(false);
            window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank');
        } catch (e: unknown) {
            setWhatsappLoading(false);
            setWhatsappDialogOpen(false);
            const msg = e instanceof Error ? e.message : 'Could not generate WhatsApp message.';
            toast.error(msg);
        }
    };

    return (
        <Card className="flex flex-col h-full border-input shadow-none p-4 rounded-md">
            <CardHeader className="flex flex-col gap-3 p-0">
                <div className="flex flex-col gap-2 w-full min-w-0">
                    <div className="flex justify-between items-center gap-2 w-full min-w-0">
                        <div className="min-w-0 flex-1">
                            <CardTitle
                                className="text-lg font-semibold truncate"
                                title={displayName}
                            >
                                {displayName}
                            </CardTitle>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <StarFill className="size-4 text-yellow-500 fill-yellow-500" />
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold">
                                    {provider.rating?.toFixed(1) || 'N/A'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    ({provider.ratingCount || 0})
                                </span>
                            </div>
                            <FavouriteButton
                                placeId={provider.place_id}
                                providerName={displayName}
                                variant="icon"
                                className="-mr-1"
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <ServiceBadges
                            services={provider.services || []}
                            trade={trade}
                            isOpen={provider.isOpen}
                            providerName={displayName}
                        />
                    </div>
                </div>
            </CardHeader>
            <div className="flex items-center gap-1 w-full text-xs text-muted-foreground min-w-0">
                <span className="truncate min-w-0" title={provider.address}>
                    {provider.address}
                </span>
                {distance && (
                    <span className="flex-none whitespace-nowrap">
                        {' '}
                        • {String(distance).endsWith('km') ? distance : `${distance} km`}
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Customer Summary</p>
                </div>
                <blockquote className="border-l-2 border-input pl-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {formatCustomerSummary(provider.summary || '', provider.name || displayName)}
                    </p>
                </blockquote>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-auto">
                <Popover
                    open={contactPopoverOpen}
                    onOpenChange={setContactPopoverOpen}
                >
                    <PopoverTrigger asChild>
                        <Button variant="default" className="flex-1 min-w-0">
                            Contact
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-56 p-3 rounded-md shadow-xl border-input"
                        align="start"
                        side="top"
                    >
                        <div className="flex flex-col gap-1">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">
                                Recommended
                            </p>
                            <Button
                                variant="secondary"
                                className="justify-start w-full"
                                onClick={handleSendWhatsAppSummary}
                                disabled={!waCapable}
                                title={
                                    !waCapable && waPhone
                                        ? "This number doesn't appear to be a mobile number — WhatsApp requires a mobile number."
                                        : undefined
                                }
                            >
                                Send WhatsApp Summary
                            </Button>

                            <Separator className="my-2" />

                            {provider.phone && (
                                <Button
                                    variant="ghost"
                                    className="justify-start w-full mb-1"
                                    asChild
                                >
                                    <a
                                        href={`tel:${provider.phone}`}
                                        onClick={() => logLead('phone')}
                                        className="flex items-center justify-between w-full"
                                    >
                                        Immediate Assistance
                                    </a>
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                className="justify-start"
                                onClick={() => {
                                    logLead('email');
                                    window.open(
                                        `mailto:info@${provider.name.toLowerCase().replace(/\s+/g, '')}.com`
                                    );
                                }}
                            >
                                Request Quote
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Send WhatsApp Summary</DialogTitle>
                            <DialogDescription asChild>
                                <div>
                                {waCapable ? (
                                    <>
                                        We&apos;ve generated a summary of your diagnosis for{' '}
                                        <span className="font-medium">{displayName}</span>. You
                                        will open WhatsApp to send it.
                                        <blockquote className="mt-2 border-l-2 border-input pl-3 text-muted-foreground text-sm">
                                            We try to ensure all numbers are available on WhatsApp.
                                            If you&apos;re having trouble, please try phoning them
                                            directly.
                                        </blockquote>
                                    </>
                                ) : (
                                    <>
                                        This provider&apos;s number doesn&apos;t appear to be a
                                        mobile number.
                                        WhatsApp requires a mobile number to work.
                                    </>
                                )}
                                </div>
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmWhatsAppSummary}
                                disabled={!waPhone || !waCapable || whatsappLoading}
                            >
                                {whatsappLoading ? 'Generating…' : 'Continue'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                {provider.website && (
                    <Button
                        variant="secondary"
                        className="flex-1 min-w-0"
                        onClick={() => window.open(provider.website!, '_blank')}
                    >
                        Website
                    </Button>
                )}
                {(provider.id ?? provider.place_id) && (
                    <Button variant="secondary" className="flex-1 min-w-0" asChild>
                        <a
                            href={`/pro/${encodeURIComponent(provider.place_id ?? provider.id ?? '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            View Account
                        </a>
                    </Button>
                )}
            </div>
        </Card>
    );
}
