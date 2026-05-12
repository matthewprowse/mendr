'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { BetaCostEstimateCard } from '@/components/beta-cost-estimate-card';
import type { DiagnosisData } from '@/features/diagnosis/types';
import { fetchConversationDiagnosis } from '@/lib/diagnoses-api';

export default function CostPageClient({ conversationId }: { conversationId: string }) {
    const router = useRouter();
    const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetchConversationDiagnosis(conversationId);
                if (cancelled) return;
                if (res.ok) {
                    setDiagnosis((res.data?.diagnosis as DiagnosisData | null) ?? null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [conversationId]);

    return (
        <div className="min-h-dvh bg-background">
            <div className="mx-auto w-full max-w-3xl p-6">
                <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-10"
                    onClick={() => router.back()}
                    aria-label="Back"
                >
                    <ArrowLeft weight="bold" />
                </Button>
                <div className="mt-6 flex flex-col gap-4">
                    <h1 className="text-2xl font-semibold text-foreground">Cost Breakdown</h1>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading cost details...</p>
                    ) : diagnosis ? (
                        <BetaCostEstimateCard diagnosis={diagnosis} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Cost details are not available for this diagnosis yet.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
