'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const TRADES = {
    Plumbing: [
        'Leak Repair',
        'Geyser Maintenance',
        'Drain Cleaning',
        'Pipe Bursts & Replacement',
        'Faucet & Toilet Repair',
        'Water Pressure Issues',
    ],
    Electrical: [
        'DB Board Tripping',
        'Power Failures',
        'Lighting Repair',
        'Socket & Switch Replacement',
        'Wiring Issues',
        'Electrical Panel Upgrades',
    ],
    'Security & Access': [
        'Gate Motor Repair',
        'Garage Door Automation',
        'CCTV & Alarm Systems',
        'Electric Fencing',
        'Intercom Systems',
        'Security Hardware',
    ],
    'Roofing & Waterproofing': [
        'Roof Leak Identification',
        'Gutter Repair',
        'Shingle/Tile Replacement',
        'Waterproofing (Ceiling/Balcony)',
        'Damp Treatment',
    ],
} as const;

export function ProSignupSection() {
    const [companyName, setCompanyName] = useState('');
    const [email, setEmail] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [googleMapsLink, setGoogleMapsLink] = useState('');
    const [mainTrade, setMainTrade] = useState<string>('');
    const [teamSize, setTeamSize] = useState('');
    const [additionalInfo, setAdditionalInfo] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !email.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/provider-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName.trim(),
                    email: email.trim(),
                    contact_number: contactNumber.trim() || undefined,
                    google_maps_link: googleMapsLink.trim() || undefined,
                    main_trade: mainTrade || undefined,
                    descriptive_text: additionalInfo.trim() || undefined,
                    team_size: teamSize || undefined,
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
            setContactNumber('');
            setGoogleMapsLink('');
            setMainTrade('');
            setTeamSize('');
            setAdditionalInfo('');
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <section id="register" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
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

    return (
        <section id="register" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Join Network</h2>
                    <p className="mt-4 text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-6 rounded-lg border border-border bg-secondary/50 p-4 sm:p-6"
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
                        <div className="space-y-3">
                            <Label htmlFor="team_size">Team Size</Label>
                            <Select value={teamSize || undefined} onValueChange={setTeamSize}>
                                <SelectTrigger id="team_size" className="h-9 w-full text-[14px] sm:text-sm leading-none bg-background">
                                    <SelectValue placeholder="Select Team Size" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1–5">1–5</SelectItem>
                                    <SelectItem value="6–20">6–20</SelectItem>
                                    <SelectItem value="21–50">21–50</SelectItem>
                                    <SelectItem value="50+">50+</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="maps">Google Maps Link</Label>
                        <Input
                            id="maps"
                            value={googleMapsLink}
                            onChange={(e) => setGoogleMapsLink(e.target.value)}
                            placeholder="Enter Business Location URL"
                            className="text-[14px] sm:text-sm bg-background"
                        />
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="main_trade">Main Trade</Label>
                        <Select value={mainTrade} onValueChange={setMainTrade}>
                            <SelectTrigger id="main_trade" className="h-9 w-full text-[14px] sm:text-sm leading-none bg-background">
                                <SelectValue placeholder="Select Main Trade" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(TRADES).map((trade) => (
                                    <SelectItem key={trade} value={trade}>
                                        {trade}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="additional_info">Additional Information</Label>
                        <Textarea
                            id="additional_info"
                            value={additionalInfo}
                            onChange={(e) => setAdditionalInfo(e.target.value)}
                            className="min-h-[72px] max-h-[148px] text-[14px] sm:text-sm bg-background"
                            rows={4}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? 'Submitting…' : 'Join Network'}
                    </Button>
                </form>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
            </div>
        </section>
    );
}
