'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthHeader } from '../_components/auth-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function OnboardingPage() {
    const [firstName, setFirstName] = useState('');
    const [surname, setSurname] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const checkUser = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                router.replace('/auth/login');
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, surname, description')
                .eq('user_id', user.id)
                .single();

            if (profile?.first_name && profile?.surname && profile?.description) {
                router.replace('/');
                return;
            }
            if (profile) {
                setFirstName(profile.first_name || '');
                setSurname(profile.surname || '');
                setDescription(profile.description || '');
            }
            setCheckingAuth(false);
        };
        checkUser();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            router.replace('/auth/login');
            return;
        }

        const { error: upsertError } = await supabase.from('profiles').upsert(
            {
                id: user.id,
                user_id: user.id,
                first_name: firstName.trim(),
                surname: surname.trim(),
                description: description.trim(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
        );

        setLoading(false);

        if (upsertError) {
            setError(upsertError.message);
            return;
        }

        router.replace('/');
    };

    if (checkingAuth) {
        return (
            <div className="flex min-h-screen flex-col bg-background">
                <AuthHeader />
                <div className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-muted-foreground">Loading…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AuthHeader />
            <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
                <div className="w-full max-w-sm space-y-6">
                    <div className="space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Complete your profile
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Tell us a bit about yourself.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First name</Label>
                            <Input
                                id="firstName"
                                type="text"
                                placeholder="John"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="surname">Surname</Label>
                            <Input
                                id="surname"
                                type="text"
                                placeholder="Smith"
                                value={surname}
                                onChange={(e) => setSurname(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="A short bio or what you're looking for..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                required
                                disabled={loading}
                                className="min-h-24 resize-none"
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Saving…' : 'Continue'}
                        </Button>
                    </form>

                    {error && <p className="text-center text-sm text-destructive">{error}</p>}
                </div>
            </main>
        </div>
    );
}
