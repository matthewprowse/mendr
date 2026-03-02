import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PLAN_TIERS, formatSeatLimit } from '@/lib/plan-tiers';

export const metadata: Metadata = {
    title: 'Upgrade plan',
    description: 'Upgrade your Scandio Pro plan for more seats and higher-tier badges.',
};

export default function ProUpgradePage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Upgrade your plan</h1>
                    <p className="mt-2 text-muted-foreground">
                        Choose a plan that fits your team. Higher tiers unlock more seats and stronger homeowner badges.
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.values(PLAN_TIERS).map((tier) => (
                        <Card key={tier.key} className="flex flex-col">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{tier.label}</CardTitle>
                                <p className="text-2xl font-bold text-foreground">{tier.feeFormatted}</p>
                                <p className="text-sm text-muted-foreground">{formatSeatLimit(tier.key)}</p>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col gap-2">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground">Badge</p>
                                    <p className="text-sm font-medium">{tier.badgeEarned}</p>
                                </div>
                                <p className="text-sm text-muted-foreground flex-1">{tier.badgeCopy}</p>
                                <Button variant="outline" size="sm" className="mt-auto w-full" asChild>
                                    <Link href="/pro/dashboard">Select plan</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Billing and payment integration coming soon. Contact support to change your plan.
                </p>

                <div className="mt-8 flex justify-center">
                    <Button variant="ghost" asChild>
                        <Link href="/pro/dashboard">Back to dashboard</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
