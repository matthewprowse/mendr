'use client';

import { useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DiagnosisRow = {
    id: string;
    title: string | null;
    created_at: string;
    diagnosis: { trade?: string; diagnosis?: string } | null;
};

export type SavedLocation = {
    id: string;
    label: string;
    address: string;
    lat?: number | null;
    lng?: number | null;
};

// ── AccountAuthClient — unauthenticated state ─────────────────────────────────

export function AccountAuthClient() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
            <div className="mb-8 text-center">
                <span className="text-2xl font-bold tracking-tight text-gray-900">Menda</span>
            </div>
            <AuthCard
                mode="signin"
                redirectTo="/account"
                heading="Sign in to your account"
                subheading="View past diagnoses and save your addresses"
            />
        </div>
    );
}

// ── Relative date helper ──────────────────────────────────────────────────────

function relativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${Math.floor(diffMonths / 12)}y ago`;
}

// ── AccountDashboardClient — authenticated state ──────────────────────────────

export function AccountDashboardClient({
    diagnoses,
    locations: initialLocations,
    userId: _userId,
}: {
    diagnoses: DiagnosisRow[];
    locations: SavedLocation[];
    userId: string;
}) {
    const [tab, setTab] = useState<'diagnoses' | 'addresses'>('diagnoses');
    const [locations, setLocations] = useState<SavedLocation[]>(initialLocations);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const MAX_LOCATIONS = 10;

    async function handleAddLocation(e: React.FormEvent) {
        e.preventDefault();
        setSaveError(null);
        const label = newLabel.trim();
        const address = newAddress.trim();
        if (!label || !address) {
            setSaveError('Both label and address are required.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/account/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, address }),
            });
            const json = (await res.json().catch(() => null)) as {
                location?: SavedLocation;
                error?: string;
            } | null;
            if (!res.ok || !json?.location) {
                setSaveError(json?.error ?? 'Could not save address. Please try again.');
                return;
            }
            setLocations((prev) => [...prev, json.location!]);
            setNewLabel('');
            setNewAddress('');
            setShowAddForm(false);
        } catch {
            setSaveError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteLocation(id: string) {
        setDeletingId(id);
        try {
            await fetch(`/api/account/locations?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
            });
            setLocations((prev) => prev.filter((l) => l.id !== id));
        } catch {
            // Silent — list stays unchanged
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-12">
            <div className="mx-auto max-w-lg">
                <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">My Account</h1>

                {/* Tab buttons */}
                <div className="mb-6 flex gap-1 rounded-lg border bg-white p-1">
                    {(
                        [
                            { key: 'diagnoses', label: 'Past Diagnoses' },
                            { key: 'addresses', label: 'Saved Addresses' },
                        ] as const
                    ).map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn(
                                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                tab === key
                                    ? 'bg-gray-900 text-white'
                                    : 'text-muted-foreground hover:text-gray-900'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Past Diagnoses tab */}
                {tab === 'diagnoses' && (
                    <div className="flex flex-col gap-3">
                        {diagnoses.length === 0 ? (
                            <Card>
                                <CardContent className="py-8 text-center">
                                    <p className="mb-4 text-sm text-muted-foreground">
                                        No diagnoses yet.
                                    </p>
                                    <Button
                                        variant="outline"
                                        onClick={() => (window.location.href = '/start')}
                                    >
                                        Start a diagnosis
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : (
                            diagnoses.map((d) => {
                                const trade = d.diagnosis?.trade;
                                const text =
                                    d.title ||
                                    (d.diagnosis?.diagnosis?.slice(0, 80) ?? 'Diagnosis');
                                return (
                                    <a
                                        key={d.id}
                                        href={`/report/${d.id}`}
                                        className="block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                {trade && (
                                                    <Badge variant="secondary" className="mb-1">
                                                        {trade}
                                                    </Badge>
                                                )}
                                                <p className="truncate text-sm font-medium text-gray-900">
                                                    {text}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {relativeDate(d.created_at)}
                                            </span>
                                        </div>
                                    </a>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Saved Addresses tab */}
                {tab === 'addresses' && (
                    <div className="flex flex-col gap-3">
                        {locations.map((loc) => (
                            <Card key={loc.id}>
                                <CardContent className="flex items-center justify-between py-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-900">{loc.label}</p>
                                        <p className="truncate text-sm text-muted-foreground">
                                            {loc.address}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${loc.label}`}
                                        disabled={deletingId === loc.id}
                                        onClick={() => void handleDeleteLocation(loc.id)}
                                        className="ml-3 shrink-0 text-muted-foreground hover:text-red-600 disabled:opacity-40"
                                    >
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            aria-hidden
                                        >
                                            <path
                                                d="M4 4l8 8M12 4l-8 8"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    </button>
                                </CardContent>
                            </Card>
                        ))}

                        {locations.length < MAX_LOCATIONS && (
                            <>
                                {!showAddForm ? (
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => setShowAddForm(true)}
                                    >
                                        + Add address
                                    </Button>
                                ) : (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Add address</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <form
                                                onSubmit={(e) => void handleAddLocation(e)}
                                                className="flex flex-col gap-3"
                                            >
                                                <div className="flex flex-col gap-1.5">
                                                    <Label htmlFor="loc-label">Label</Label>
                                                    <Input
                                                        id="loc-label"
                                                        placeholder="Home, Work, Parents…"
                                                        value={newLabel}
                                                        onChange={(e) =>
                                                            setNewLabel(e.target.value)
                                                        }
                                                        maxLength={50}
                                                        disabled={saving}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <Label htmlFor="loc-address">Address</Label>
                                                    <Input
                                                        id="loc-address"
                                                        placeholder="123 Main Road, Cape Town"
                                                        value={newAddress}
                                                        onChange={(e) =>
                                                            setNewAddress(e.target.value)
                                                        }
                                                        maxLength={200}
                                                        disabled={saving}
                                                    />
                                                </div>
                                                {saveError && (
                                                    <p
                                                        className="text-sm text-red-600"
                                                        role="alert"
                                                    >
                                                        {saveError}
                                                    </p>
                                                )}
                                                <div className="flex gap-2">
                                                    <Button
                                                        type="submit"
                                                        disabled={saving}
                                                        className="flex-1"
                                                    >
                                                        {saving ? 'Saving…' : 'Save'}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setShowAddForm(false);
                                                            setSaveError(null);
                                                        }}
                                                        disabled={saving}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </form>
                                        </CardContent>
                                    </Card>
                                )}
                            </>
                        )}

                        {locations.length === 0 && !showAddForm && (
                            <p className="text-center text-sm text-muted-foreground">
                                No saved addresses yet.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
