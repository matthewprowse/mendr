'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PLAN_IDS, PLANS, type PlanId } from '@/lib/pro/plans';

export default function PlanClient({
    current,
    seatsUsed,
    canManage,
}: {
    current: PlanId;
    seatsUsed: number;
    canManage: boolean;
}) {
    const router = useRouter();
    const [plan, setPlan] = useState<PlanId>(current);
    const [busy, setBusy] = useState<PlanId | null>(null);

    const choose = async (target: PlanId) => {
        if (busy || target === plan) return;
        setBusy(target);
        try {
            const res = await fetch('/api/pro/plan', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: target }),
            });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Could not change plan.');
                return;
            }
            setPlan(target);
            toast.success(`You are on the ${PLANS[target].name} plan.`);
            router.refresh();
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Plan</h1>
                <p className="text-sm text-muted-foreground">
                    Choose the plan that fits your team and reach.
                </p>
            </div>

            <div className="rounded-lg border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">
                    Billing is not live yet, so you will not be charged. Prices are shown to
                    give you a sense of what each plan will cost when billing launches.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                {PLAN_IDS.map((id) => {
                    const p = PLANS[id];
                    const isCurrent = id === plan;
                    return (
                        <div
                            key={id}
                            data-current={isCurrent}
                            className="flex flex-col gap-3 rounded-lg border border-border p-4 data-[current=true]:border-foreground"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-base font-semibold text-foreground">
                                        {p.name}
                                        {isCurrent ? (
                                            <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
                                                Current
                                            </span>
                                        ) : null}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{p.blurb}</p>
                                </div>
                                <p className="shrink-0 text-right text-sm font-semibold text-foreground">
                                    {p.priceZar === 0 ? 'Free' : `R ${p.priceZar}`}
                                    {p.priceZar === 0 ? (
                                        ''
                                    ) : (
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {' '}
                                            /mo
                                        </span>
                                    )}
                                </p>
                            </div>

                            <ul className="flex flex-col gap-1.5">
                                {p.features.map((f) => (
                                    <li
                                        key={f}
                                        className="flex items-center gap-2 text-sm text-foreground"
                                    >
                                        <Check className="size-4 shrink-0 text-muted-foreground" />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            {canManage && !isCurrent ? (
                                <Button
                                    variant="secondary"
                                    className="w-fit"
                                    disabled={busy !== null}
                                    onClick={() => void choose(id)}
                                >
                                    {busy === id ? 'Switching…' : `Switch to ${p.name}`}
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <p className="text-xs text-muted-foreground">
                {`You are using ${seatsUsed} of ${PLANS[plan].limits.maxSeats} seat(s) on the ${PLANS[plan].name} plan.`}
                {canManage ? '' : ' Only the owner can change the plan.'}
            </p>
        </>
    );
}
