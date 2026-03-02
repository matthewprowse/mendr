'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SettingsClient({
    slug,
    planTier,
    baseCalloutFee,
    ratePerKm,
}: {
    slug: string;
    planTier: string;
    baseCalloutFee: number | null;
    ratePerKm: number | null;
}) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-muted-foreground text-sm">
                    Your Pro account and business settings.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm">
                        <span className="text-muted-foreground">Slug:</span> {slug}
                    </p>
                    <p className="text-sm">
                        <span className="text-muted-foreground">Plan:</span>{' '}
                        {planTier.replace(/_/g, ' ')}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm">
                        <span className="text-muted-foreground">Base call-out fee:</span>{' '}
                        {baseCalloutFee != null ? `R ${baseCalloutFee}` : 'Not set'}
                    </p>
                    <p className="text-sm">
                        <span className="text-muted-foreground">Rate per km:</span>{' '}
                        {ratePerKm != null ? `R ${ratePerKm}` : 'Not set'}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                        Edit pricing and documents from here (form can be added).
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
