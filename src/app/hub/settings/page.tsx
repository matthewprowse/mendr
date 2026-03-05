'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

type LocationEntry = { label?: string; address?: string };

export default function SettingsPage() {
    const { user } = useAuth();
    const [locations, setLocations] = useState<LocationEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('locations')
                .eq('id', user.id)
                .maybeSingle();
            if (!error && data?.locations && Array.isArray(data.locations)) {
                setLocations(
                    (data.locations as LocationEntry[]).length > 0
                        ? (data.locations as LocationEntry[])
                        : [{ label: 'Home', address: '' }]
                );
            } else {
                setLocations([{ label: 'Home', address: '' }]);
            }
            setLoading(false);
        })();
    }, [user?.id]);

    const updateLocation = (index: number, field: 'label' | 'address', value: string) => {
        setLocations((prev) => {
            const next = [...prev];
            if (!next[index]) next[index] = {};
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const addLocation = () => {
        setLocations((prev) => [...prev, { label: '', address: '' }]);
    };

    const removeLocation = (index: number) => {
        setLocations((prev) => prev.filter((_, i) => i !== index));
    };

    const save = async () => {
        if (!user?.id) return;
        setSaving(true);
        const toSave = locations
            .map((l) => ({ label: l.label || 'Address', address: l.address || '' }))
            .filter((l) => l.address.trim());
        const { error } = await supabase
            .from('profiles')
            .update({ locations: toSave.length > 0 ? toSave : [], updated_at: new Date().toISOString() })
            .eq('id', user.id);
        setSaving(false);
        if (error) {
            toast.error('Failed to save settings');
            return;
        }
        toast.success('Settings saved');
        setLocations(toSave.length > 0 ? toSave : [{ label: 'Home', address: '' }]);
    };

    if (loading) {
        return (
            <div className="mx-auto flex min-h-[40vh] max-w-2xl items-center justify-center px-4 py-12">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Manage your service address(es) and preferences.
            </p>

            <section className="mt-8 space-y-6">
                <div>
                    <h2 className="text-sm font-medium text-foreground">Service addresses</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Used for diagnosis and matching with local Pros.
                    </p>
                    <div className="mt-4 space-y-4">
                        {locations.map((loc, i) => (
                            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                        <Label htmlFor={`label-${i}`}>Label</Label>
                                        <Input
                                            id={`label-${i}`}
                                            placeholder="e.g. Home"
                                            value={loc.label ?? ''}
                                            onChange={(e) => updateLocation(i, 'label', e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div className="sm:col-span-2 sm:col-start-1">
                                        <Label htmlFor={`address-${i}`}>Address</Label>
                                        <Input
                                            id={`address-${i}`}
                                            placeholder="Street, suburb, city"
                                            value={loc.address ?? ''}
                                            onChange={(e) => updateLocation(i, 'address', e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                {locations.length > 1 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => removeLocation(i)}
                                    >
                                        Remove
                                    </Button>
                                )}
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addLocation}>
                            Add address
                        </Button>
                    </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                    <h2 className="text-sm font-medium text-foreground">Notifications</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Preferences for report and job updates (coming soon).
                    </p>
                </div>

                <Button onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                </Button>
            </section>
        </div>
    );
}
