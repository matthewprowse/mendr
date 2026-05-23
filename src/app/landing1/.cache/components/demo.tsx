'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Loader2, CheckCircle, Camera, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type DemoState = 'idle' | 'processing' | 'result';

const SAMPLE_FAULTS = [
    { label: 'Damp patch on ceiling', tag: 'Penetrating damp' },
    { label: 'Cracked plaster on wall', tag: 'Structural movement' },
    { label: 'Rust stains on exterior', tag: 'Coastal corrosion' },
];

function IdleState({ onStart }: { onStart: () => void }) {
    return (
        <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 text-center"
        >
            <button
                onClick={onStart}
                className="group relative flex h-40 w-full max-w-sm flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#C45C3A]/30 bg-[#C45C3A]/5 transition-colors hover:border-[#C45C3A]/60 hover:bg-[#C45C3A]/10"
            >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C45C3A]/10 transition-colors group-hover:bg-[#C45C3A]/20">
                    <Camera className="h-5 w-5 text-[#C45C3A]" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-[#1C2B3A]">Upload a photo</p>
                    <p className="mt-0.5 text-xs text-[#2F3E4E]/50">or click to simulate</p>
                </div>
                <Upload className="absolute right-3 top-3 h-3.5 w-3.5 text-[#2F3E4E]/20" />
            </button>

            <div className="flex flex-wrap justify-center gap-2">
                {SAMPLE_FAULTS.map((f) => (
                    <button
                        key={f.label}
                        onClick={onStart}
                        className="rounded-full border border-[#E8E4DD] bg-white px-3 py-1.5 text-xs text-[#2F3E4E]/70 transition-colors hover:border-[#C45C3A]/30 hover:text-[#C45C3A]"
                    >
                        {f.label}
                    </button>
                ))}
            </div>
        </motion.div>
    );
}

const STEPS = [
    'Analysing image…',
    'Identifying fault pattern…',
    'Cross-referencing Cape Town building data…',
    'Generating diagnosis…',
];

function ProcessingState() {
    const [step] = useState(0);

    return (
        <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center"
        >
            {/* Simulated image thumbnail */}
            <div className="relative h-32 w-full max-w-sm overflow-hidden rounded-xl bg-[#1C2B3A]/10">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-20 w-20 rounded-lg bg-[#2F3E4E]/20" />
                </div>
                {/* Scanning line */}
                <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-[#C45C3A]/60"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
            </div>

            <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-[#C45C3A]" />
                <AnimatePresence mode="wait">
                    <motion.p
                        key={step}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-sm text-[#2F3E4E]/70"
                    >
                        {STEPS[step]}
                    </motion.p>
                </AnimatePresence>
            </div>

            <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 rounded-full transition-all duration-300 ${
                            i <= step ? 'w-6 bg-[#C45C3A]' : 'w-3 bg-[#E8E4DD]'
                        }`}
                    />
                ))}
            </div>
        </motion.div>
    );
}

function ResultState({ onReset }: { onReset: () => void }) {
    return (
        <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full"
        >
            {/* Diagnosis card */}
            <div className="w-full rounded-2xl border border-[#E8E4DD] bg-white p-5 shadow-sm">
                {/* Header row */}
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-[#6B8F71]" />
                        <span className="text-xs font-semibold text-[#6B8F71]">Diagnosis complete</span>
                    </div>
                    <span className="rounded-full bg-[#C45C3A]/10 px-2.5 py-1 text-xs font-semibold text-[#C45C3A]">
                        Moderate urgency
                    </span>
                </div>

                {/* Diagnosis */}
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#2F3E4E]/40">
                    Fault identified
                </p>
                <p className="mt-1 text-base font-semibold leading-snug text-[#1C2B3A]">
                    Penetrating damp — parapet or roof flashing failure
                </p>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-3 divide-x divide-[#E8E4DD] border-y border-[#E8E4DD] py-3 text-center">
                    <div>
                        <p className="text-[9px] uppercase tracking-wide text-[#2F3E4E]/40">Cause</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#1C2B3A]">Flashing</p>
                    </div>
                    <div>
                        <p className="text-[9px] uppercase tracking-wide text-[#2F3E4E]/40">Address by</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#6B8F71]">1–3 months</p>
                    </div>
                    <div>
                        <p className="text-[9px] uppercase tracking-wide text-[#2F3E4E]/40">Est. cost</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#1C2B3A]">R2,400+</p>
                    </div>
                </div>

                {/* Bullets */}
                <ul className="mt-3 space-y-1.5">
                    {[
                        'Very common in Cape Town homes built before 1980',
                        'Inspect flashings and parapet coping before repainting',
                        'Left unaddressed, can cause timber rot and mould',
                    ].map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-xs text-[#2F3E4E]/60">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C45C3A]" />
                            {pt}
                        </li>
                    ))}
                </ul>

                {/* CTAs */}
                <div className="mt-4 flex flex-col gap-2">
                    <Link
                        href="/start"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C45C3A] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A84D30]"
                    >
                        Find a contractor for this
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                        onClick={onReset}
                        className="text-xs text-[#2F3E4E]/40 underline-offset-2 hover:text-[#2F3E4E]/70 hover:underline"
                    >
                        Try another fault
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

export function Land1Demo() {
    const [state, setState] = useState<DemoState>('idle');

    const handleStart = () => {
        setState('processing');
        setTimeout(() => setState('result'), 3000);
    };

    return (
        <section id="how-it-works" className="bg-[#FAFAF8] py-16 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-2">
                    {/* Left: copy */}
                    <div>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#C45C3A]">
                            See it in action
                        </p>
                        <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold leading-tight text-[#1C2B3A] sm:text-4xl">
                            A diagnosis in under 60 seconds.
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-[#2F3E4E]/70">
                            Upload a photo of any home fault — damp, cracks, rust, electrical concerns, plumbing leaks — and our
                            AI will identify the issue, explain the likely cause, and tell you how urgently you need to act.
                        </p>

                        <ul className="mt-6 space-y-3">
                            {[
                                'No account or sign-up required',
                                'Plain language — no jargon',
                                'Tailored to Western Cape homes and climate',
                                'Free for homeowners, always',
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-3 text-sm text-[#2F3E4E]/70">
                                    <CheckCircle className="h-4 w-4 shrink-0 text-[#6B8F71]" />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        <Link
                            href="/start"
                            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#C45C3A] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(196,92,58,0.3)] transition-colors hover:bg-[#A84D30]"
                        >
                            Upload your photo now
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    {/* Right: interactive demo */}
                    <div className="rounded-3xl border border-[#E8E4DD] bg-white p-6 shadow-sm sm:p-8">
                        <div className="mb-5 flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#1C2B3A]">Try the demo</p>
                            <div className="flex gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-full bg-[#E8E4DD]" />
                                <div className="h-2.5 w-2.5 rounded-full bg-[#E8E4DD]" />
                                <div className="h-2.5 w-2.5 rounded-full bg-[#C45C3A]" />
                            </div>
                        </div>

                        <div className="min-h-[260px]">
                            <AnimatePresence mode="wait">
                                {state === 'idle' && <IdleState onStart={handleStart} />}
                                {state === 'processing' && <ProcessingState />}
                                {state === 'result' && <ResultState onReset={() => setState('idle')} />}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
