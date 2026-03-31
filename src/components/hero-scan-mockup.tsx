'use client';

import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';

const SCAN_DURATION = 2.2;

export function HeroScanMockup() {
    return (
        <div className="relative w-full max-w-[348px] overflow-hidden rounded-3xl border border-border/50 bg-secondary/50 transition-all duration-300 hover:bg-secondary/25">
            <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                {/* Background image placeholder / eventual report UI */}
                <div className="pointer-events-none absolute inset-6 rounded-2xl bg-slate-900/60 ring-1 ring-white/5" />

                {/* Scan bar */}
                <motion.div
                    className="pointer-events-none absolute -inset-x-10 h-24 bg-gradient-to-b from-emerald-400/0 via-emerald-400/15 to-emerald-400/0 blur-md will-change-transform"
                    initial={{ y: '110%' }}
                    animate={{ y: ['110%', '-10%'] }}
                    transition={{
                        duration: SCAN_DURATION,
                        ease: [0.22, 0.61, 0.36, 1],
                        repeat: Infinity,
                        repeatDelay: 0.5,
                    }}
                />

                {/* Scan edge highlight */}
                <motion.div
                    className="pointer-events-none absolute -inset-x-10 h-px bg-gradient-to-b from-emerald-300/0 via-emerald-300/80 to-emerald-300/0 mix-blend-screen"
                    initial={{ y: '110%' }}
                    animate={{ y: ['110%', '-10%'] }}
                    transition={{
                        duration: SCAN_DURATION,
                        ease: [0.22, 0.61, 0.36, 1],
                        repeat: Infinity,
                        repeatDelay: 0.5,
                    }}
                />

                {/* Annotations that appear as the scan passes */}
                <Annotation
                    style={{ top: '22%', left: '16%' }}
                    delay={0.5}
                    label="Damp ingress detected"
                    value="High risk"
                />
                <Annotation
                    style={{ top: '46%', right: '10%' }}
                    delay={0.9}
                    label="Repair estimate"
                    value="R4 500 – R6 800"
                />
                <Annotation
                    style={{ bottom: '18%', left: '20%' }}
                    delay={1.3}
                    label="Suggested trade"
                    value="Waterproofing specialist"
                />
            </div>
        </div>
    );
}

function Annotation({
    label,
    value,
    delay = 0,
    style,
}: {
    label: string;
    value: string;
    delay?: number;
    style?: CSSProperties;
}) {
    return (
        <motion.div
            className="pointer-events-none absolute max-w-[220px] rounded-xl bg-slate-900/90 px-3 py-2 text-xs text-slate-50 shadow-[0_18px_45px_rgba(15,23,42,0.65)] ring-1 ring-emerald-400/40 backdrop-blur"
            style={style}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay,
                duration: 0.35,
                ease: [0.22, 0.61, 0.36, 1],
            }}
        >
            <p className="text-[0.68rem] uppercase tracking-wide text-emerald-300/80">
                {label}
            </p>
            <p className="mt-0.5 text-[0.78rem] font-medium">{value}</p>
        </motion.div>
    );
}

