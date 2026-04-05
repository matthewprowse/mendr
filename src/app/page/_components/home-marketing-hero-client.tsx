'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { StartDiagnosisButton } from '@/app/page/_components/start-diagnosis-button';
import { Placeholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';

export function HomeMarketingHeroClient() {
    return (
        <section className="relative overflow-hidden">
            <div
                className="absolute inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    backgroundImage: 'radial-gradient(circle, var(--foreground) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    opacity: 0.027,
                }}
            />
            <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
                <div className="grid items-center gap-12 lg:grid-cols-[3fr_2fr]">
                    <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                            Something Broken At Home? Diagnose It Before Calling Anyone.
                        </h1>
                        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                            Upload a photo, get a clearer understanding of what is likely happening, and make a better
                            decision before speaking to providers.
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <StartDiagnosisButton size="lg">Generate Free Scandio Report</StartDiagnosisButton>
                            <Button variant="ghost" className="h-10 text-sm" asChild>
                                <Link href="#how-it-works">How Scandio works</Link>
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">Free report · No account required</p>
                    </div>
                    <motion.div
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.7 }}
                        className="mx-auto w-full max-w-[360px]"
                    >
                        <Placeholder label="" aspectRatio="aspect-[9/16]" className="w-full rounded-xl" />
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
