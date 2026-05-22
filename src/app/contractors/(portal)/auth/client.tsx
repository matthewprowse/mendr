'use client';

import { AuthCard } from '@/components/auth-card';

export default function ContractorsAuthClient({ redirectTo }: { redirectTo: string }) {
    return (
        <>
            <title>Contractor Sign In | Mendr</title>
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
                <div className="mb-8 text-center">
                    <span className="text-2xl font-bold tracking-tight text-gray-900">Mendr</span>
                </div>
                <AuthCard
                    mode="signin"
                    redirectTo={redirectTo}
                    heading="Contractor sign in"
                    subheading="Sign in to apply or view your application status"
                />
            </div>
        </>
    );
}
