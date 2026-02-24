'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export function ProSignupSection() {
    const [companyName, setCompanyName] = useState('');
    const [email, setEmail] = useState('');
    const [descriptiveText, setDescriptiveText] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [spendPerMonth, setSpendPerMonth] = useState('');
    const [signupSubmitting, setSignupSubmitting] = useState(false);
    const [signupSuccess, setSignupSuccess] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !email.trim()) return;
        setSignupSubmitting(true);
        try {
            const res = await fetch('/api/provider-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName.trim(),
                    email: email.trim(),
                    descriptive_text: descriptiveText.trim() || undefined,
                    team_size: teamSize || undefined,
                    spend_per_month: spendPerMonth || undefined,
                    report_conversation_id: undefined,
                    marketing_consent: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setSignupSuccess(true);
            toast.success("Thank you! We'll be in touch soon.");
            setCompanyName('');
            setEmail('');
            setDescriptiveText('');
            setTeamSize('');
            setSpendPerMonth('');
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setSignupSubmitting(false);
        }
    };

    return (
        <section id="register" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        Join Network
                    </h2>
                    <p className="mt-4 text-muted-foreground">
                        Join Western Cape contractors on Scandio Pro. We&apos;re listing and
                        promoting providers for free until September 2026.
                    </p>
                </div>
                {signupSuccess ? (
                    <p className="text-center text-muted-foreground">
                        Thank you for your interest in Scandio. We&apos;ll be in touch with more
                        information soon.
                    </p>
                ) : (
                    <form onSubmit={handleSignup} className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="company"
                                    className="text-sm font-medium text-foreground block"
                                >
                                    Company Name
                                </label>
                                <Input
                                    id="company"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    required
                                    className="bg-background"
                                />
                            </div>
                            <div className="space-y-2">
                                <label
                                    htmlFor="email"
                                    className="text-sm font-medium text-foreground block"
                                >
                                    Email Address
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="bg-background"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="team_size"
                                    className="text-sm font-medium text-foreground block"
                                >
                                    Team Size
                                </label>
                                <Select value={teamSize || undefined} onValueChange={setTeamSize}>
                                    <SelectTrigger id="team_size" className="w-full bg-background">
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
                            <div className="space-y-2">
                                <label
                                    htmlFor="spend_per_month"
                                    className="text-sm font-medium text-foreground block"
                                >
                                    Monthly Marketing Budget
                                </label>
                                <Select
                                    value={spendPerMonth || undefined}
                                    onValueChange={setSpendPerMonth}
                                >
                                    <SelectTrigger
                                        id="spend_per_month"
                                        className="w-full bg-background"
                                    >
                                        <SelectValue placeholder="Select Budget" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="R100">R100</SelectItem>
                                        <SelectItem value="R500">R500</SelectItem>
                                        <SelectItem value="R1000">R1,000</SelectItem>
                                        <SelectItem value="R1000+">R1,000+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="descriptive"
                                className="text-sm font-medium text-foreground block"
                            >
                                Describe Your Business
                            </label>
                            <Textarea
                                id="descriptive"
                                value={descriptiveText}
                                onChange={(e) => setDescriptiveText(e.target.value)}
                                rows={4}
                                className="bg-background resize-none"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={signupSubmitting}
                            className="w-full sm:w-auto"
                        >
                            {signupSubmitting ? 'Submitting…' : 'Join Network'}
                        </Button>
                    </form>
                )}
            </div>
        </section>
    );
}
