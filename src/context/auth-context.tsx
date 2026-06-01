'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/auth/supabase';
import { logScandioEvent } from '@/lib/audit-log';
import { Spinner } from '@/components/ui/spinner';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
    children,
    initialUser = null,
}: {
    children: React.ReactNode;
    initialUser?: User | null;
}) {
    const [user, setUser] = useState<User | null>(initialUser);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(!initialUser);

    useEffect(() => {
        const AUTH_TIMEOUT_MS = 5000;
        let attemptedAnonymousSignIn = false;
        const enableAnonAuth =
            typeof process.env.NEXT_PUBLIC_ENABLE_ANON_AUTH === 'string' &&
            process.env.NEXT_PUBLIC_ENABLE_ANON_AUTH.toLowerCase() === 'true';
        const initSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Auth timeout')), AUTH_TIMEOUT_MS)
                );
                const result = await Promise.race([sessionPromise, timeout]);
                const session = result?.data?.session ?? null;

                if (!session && enableAnonAuth && !attemptedAnonymousSignIn) {
                    attemptedAnonymousSignIn = true;
                    try {
                        const anonRes = await supabase.auth.signInAnonymously();
                        if (!anonRes?.error) {
                            const anonSession = anonRes?.data?.session ?? null;
                            setSession(anonSession);
                            setUser(anonRes?.data?.user ?? null);
                            return;
                        }
                    } catch {
                        // Fall through to anonymous user remaining null.
                    }
                }

                setSession(session);
                setUser(session?.user ?? null);
            } catch {
                setSession(null);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        initSession();

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
            setSession(session);
            setUser(session?.user ?? null);
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await logScandioEvent(supabase, { action: 'SIGN_OUT', type: 'AUTH' });
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
            {isLoading ? (
                <div className="flex min-h-screen w-full items-center justify-center bg-background">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
