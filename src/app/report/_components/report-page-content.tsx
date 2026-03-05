'use client';

import { useCallback, useState } from 'react';
import { AuthHeader } from '@/app/auth/_components/auth-header';
import { ProviderSearchMap, type ReportProvider } from './provider-search-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type ReportStep = 'search' | 'form' | 'success';

export function ReportPageContent() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [providers, setProviders] = useState<ReportProvider[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<ReportProvider | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState<ReportStep>('search');

    const mapsKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await fetch('/api/providers/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Search failed');
            setProviders(data.providers || []);
            setSelectedProvider(null);
        } catch (e) {
            toast.error('Could not search. Please try again.');
        } finally {
            setSearching(false);
        }
    }, [searchQuery]);

    const handleSelectProvider = useCallback((provider: ReportProvider) => {
        setSelectedProvider(provider);
        setStep('form');
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProvider || !subject.trim() || !body.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/report-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_place_id: selectedProvider.place_id,
                    provider_name: selectedProvider.name,
                    provider_address: selectedProvider.address || undefined,
                    subject: subject.trim(),
                    body: body.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit');
            setStep('success');
        } catch (e) {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackToSearch = () => {
        setStep('search');
        setSelectedProvider(null);
        setSubject('');
        setBody('');
    };

    if (step === 'success') {
        return (
            <div className="flex min-h-screen flex-col bg-background">
                <AuthHeader />
                <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-md space-y-6 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Thank you for your report
                        </h1>
                        <p className="text-muted-foreground">
                            Thank you for helping us keep our platform safe. We appreciate you
                            taking the time to share this with us. We will review your report and
                            get back to you with more information.
                        </p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AuthHeader />
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl space-y-6">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Report Provider</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Search for a provider to report and help us keep our platform safe.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="space-y-2">
                        <Label htmlFor="search">Search Providers</Label>
                        <div className="flex gap-2">
                            <Input
                                id="search"
                                placeholder="e.g. Plumbing Co Cape Town"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleSearch}
                                disabled={searching}
                            >
                                {searching ? 'Searching…' : 'Search'}
                            </Button>
                        </div>
                    </div>

                    {/* Map */}
                    {providers.length > 0 && mapsKey && (
                        <ProviderSearchMap
                            apiKey={mapsKey}
                            providers={providers}
                            selectedPlaceId={selectedProvider?.place_id ?? null}
                            onSelectProvider={handleSelectProvider}
                        />
                    )}

                    {/* Provider list */}
                    {providers.length > 0 && (
                        <div className="space-y-2">
                            <Label>Select a provider to report</Label>
                            <p className="text-xs text-muted-foreground">
                                Click a provider on the map or in the list below.
                            </p>
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                                {providers.map((p) => (
                                    <button
                                        key={p.place_id}
                                        type="button"
                                        onClick={() => handleSelectProvider(p)}
                                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                                            selectedProvider?.place_id === p.place_id
                                                ? 'bg-muted font-medium'
                                                : ''
                                        }`}
                                    >
                                        <span className="font-medium">{p.name}</span>
                                        {p.address && (
                                            <span className="ml-2 text-muted-foreground">
                                                — {p.address}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Report form */}
                    {step === 'form' && selectedProvider && (
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-4 rounded-lg border border-border p-4"
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">
                                    Reporting: {selectedProvider.name}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToSearch}
                                >
                                    Change provider
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="subject">Subject / header</Label>
                                <Input
                                    id="subject"
                                    placeholder="Brief summary of the issue"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="body">Details</Label>
                                <Textarea
                                    id="body"
                                    placeholder="Please describe what happened or what you'd like to report..."
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    required
                                    rows={5}
                                    className="resize-none"
                                />
                            </div>

                            <Button type="submit" className="w-full" disabled={submitting}>
                                {submitting ? 'Sending…' : 'Submit report'}
                            </Button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
