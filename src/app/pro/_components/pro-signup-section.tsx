'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type ServiceOption = {
    id: string;
    label: string;
    search_query: string;
};

// Wrapper to ensure Select's portal-based content has a proper containing block,
// which prevents Radix from creating extra whitespace / layout issues at the page bottom.
const SelectWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative inline-block w-full">{children}</div>
);

export function ProSignupSection() {
    const [companyName, setCompanyName] = useState('');
    const [email, setEmail] = useState('');
    const [googleMapsLink, setGoogleMapsLink] = useState('');
    const [additionalInfo, setAdditionalInfo] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [whatsappOnNumber, setWhatsappOnNumber] = useState(false);
    const [mainTrade, setMainTrade] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [address, setAddress] = useState('');
    const [addressLat, setAddressLat] = useState<number | null>(null);
    const [addressLng, setAddressLng] = useState<number | null>(null);
    const [addressError, setAddressError] = useState<string | null>(null);
    const [tradeOptions, setTradeOptions] = useState<ServiceOption[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadTrades = async () => {
            try {
                setTradesLoading(true);
                const res = await fetch('/api/services');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.services)) {
                    setTradeOptions(data.services);
                }
            } catch {
                // ignore; user can still type a summary of their services
            } finally {
                if (!cancelled) setTradesLoading(false);
            }
        };
        loadTrades();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleAddressBlur = async () => {
        const query = address.trim();
        if (!query) {
            setAddressError(null);
            setAddressLat(null);
            setAddressLng(null);
            setGoogleMapsLink('');
            return;
        }

        try {
            setAddressError(null);
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: query }),
            });
            const data = await res.json();

            if (!res.ok) {
                setAddressError(
                    data.error ||
                        'We could not verify this address. Please make sure it is in Western Cape, South Africa.'
                );
                setAddressLat(null);
                setAddressLng(null);
                setGoogleMapsLink('');
                return;
            }

            if (data.address && data.lat != null && data.lng != null) {
                setAddress(data.address);
                setAddressLat(data.lat);
                setAddressLng(data.lng);
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${data.lat},${data.lng}`
                )}`;
                setGoogleMapsLink(mapsUrl);
            }
        } catch {
            setAddressError('Unable to verify this address right now. Please try again in a moment.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !email.trim()) return;
        setSubmitting(true);
        try {
            const descriptiveTextParts: string[] = [];
            if (additionalInfo.trim()) descriptiveTextParts.push(additionalInfo.trim());
            if (whatsappOnNumber) descriptiveTextParts.push('WhatsApp available on contact number.');

            const res = await fetch('/api/provider-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName.trim(),
                    email: email.trim(),
                    contact_number: contactNumber.trim() || undefined,
                    google_maps_link: googleMapsLink.trim() || undefined,
                    main_trade: mainTrade || undefined,
                    descriptive_text:
                        descriptiveTextParts.length > 0
                            ? descriptiveTextParts.join(' ')
                            : undefined,
                    team_size: teamSize || undefined,
                    address: address.trim() || undefined,
                    lat: addressLat ?? undefined,
                    lng: addressLng ?? undefined,
                    report_conversation_id: undefined,
                    marketing_consent: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setSuccess(true);
            toast.success("Thank you! We'll be in touch soon.");
            setCompanyName('');
            setEmail('');
            setGoogleMapsLink('');
            setAdditionalInfo('');
            setContactNumber('');
            setWhatsappOnNumber(false);
            setMainTrade('');
            setTeamSize('');
            setAddress('');
            setAddressLat(null);
            setAddressLng(null);
            setAddressError(null);
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <section
                id="register"
                className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
            >
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Join Network</h2>
                    <p className="mt-4 text-muted-foreground">
                        Thank you for your interest in Scandio. We&apos;ll be in touch with more
                        information soon.
                    </p>
                </div>
            </section>
        );
    }

    const isValid = companyName.trim().length > 0 && email.trim().length > 0;

    return (
        <section id="register" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Join Network</h2>
                    <p className="mt-4 text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
                        tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
                        quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                        consequat.
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-6 rounded-lg border border-border bg-secondary/50 p-4 pt-6 sm:p-6"
                >


                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                            <div className="space-y-3">
                                <Label htmlFor="company">Company Name</Label>
                                <Input
                                    id="company"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    placeholder="e.g. Cape Plumbing Co."
                                    required
                                    className="text-[14px] sm:text-sm bg-background"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="e.g. contact@yourcompany.co.za"
                                    required
                                    className="text-[14px] sm:text-sm bg-background"
                                />
                            </div>
                            <div className="space-y-3 sm:col-span-2">
                                <Label htmlFor="business_address">Business Address</Label>
                                <Input
                                    id="business_address"
                                    value={address}
                                    onChange={(e) => {
                                        setAddress(e.target.value);
                                        setAddressError(null);
                                        setAddressLat(null);
                                        setAddressLng(null);
                                        setGoogleMapsLink('');
                                    }}
                                    onBlur={handleAddressBlur}
                                    placeholder="e.g. 123 Scandio Drive, Cape Town, Western Cape"
                                    className="flex-1 text-[14px] sm:text-sm bg-background"
                                />
                                {addressError && (
                                    <p className="mt-1 text-xs text-destructive">{addressError}</p>
                                )}
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="main_trade">Main Trade</Label>
                                <SelectWrapper>
                                    <Select value={mainTrade} onValueChange={setMainTrade}>
                                        <SelectTrigger
                                            id="main_trade"
                                            className="h-9 w-full text-[14px] sm:text-sm leading-none bg-background"
                                        >
                                            <SelectValue
                                                placeholder={
                                                    tradesLoading ? 'Loading…' : 'Select Main Trade'
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {tradesLoading && (
                                                <SelectItem value="loading" disabled>
                                                    Loading trades…
                                                </SelectItem>
                                            )}
                                            {tradeOptions.map((trade) => {
                                                const display =
                                                    (trade.label || trade.search_query || '').trim();
                                                if (!display) return null;
                                                return (
                                                    <SelectItem key={trade.id} value={display}>
                                                        {display}
                                                    </SelectItem>
                                                );
                                            })}
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </SelectWrapper>
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="team_size">Team Size</Label>
                                <SelectWrapper>
                                    <Select value={teamSize} onValueChange={setTeamSize}>
                                        <SelectTrigger
                                            id="team_size"
                                            className="h-9 w-full text-[14px] sm:text-sm leading-none bg-background"
                                        >
                                            <SelectValue placeholder="Select Team Size" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1–5">1–5</SelectItem>
                                            <SelectItem value="6–20">6–20</SelectItem>
                                            <SelectItem value="21–50">21–50</SelectItem>
                                            <SelectItem value="50+">50+</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </SelectWrapper>
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="contact">Contact Number</Label>
                                <Input
                                    id="contact"
                                    value={contactNumber}
                                    onChange={(e) => setContactNumber(e.target.value)}
                                    placeholder="e.g. 021 123 4567"
                                    className="text-[14px] sm:text-sm bg-background"
                                />
                            </div>
                        </div>

                    <div className="space-y-3">
                        <Label htmlFor="summary">Summary</Label>
                        <Textarea
                            id="summary"
                            value={additionalInfo}
                            onChange={(e) => setAdditionalInfo(e.target.value)}
                            className="min-h-[72px] max-h-[148px] text-[14px] sm:text-sm bg-background"
                            rows={4}
                            placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={submitting || !isValid}
                        aria-disabled={submitting || !isValid}
                    >
                        {submitting ? 'Submitting…' : 'Join Network'}
                    </Button>
                </form>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                    incididunt ut labore et dolore magna aliqua.
                </p>
            </div>
        </section>
    );
}
