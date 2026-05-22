'use client';

/**
 * Mendr — Design System
 *
 * Canonical reference. Edit this file only when the system itself changes.
 *
 * Type rules in force here:
 *   • No light (300) or extra-bold (900) — those weights are deleted from the app.
 *   • No letter-spacing modifiers anywhere. Default tracking, full stop.
 *   • No tracking-tight, no tracking-[…], no uppercase eyebrow tricks that depend on extra tracking.
 */

import { useState } from 'react';
import {
    AlertTriangle, ArrowRight, ArrowLeft, ArrowUpRight, Bell, Calendar,
    Camera, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
    Clock, Copy, Download, Droplets, Edit3, ExternalLink, Eye, FileText,
    Filter, Flame, Hammer, HelpCircle, Home as HomeIcon, Info, Loader2,
    Lock, Mail, MapPin, Menu, MessageCircle, MoreHorizontal, Paintbrush,
    Phone, Plus, RefreshCw, Search, Settings, Share2, ShieldCheck,
    Sparkles, Star, Trash2, TriangleAlert, Upload, User, Wrench, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from '@/components/ui/card';
import {
    Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle,
    SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
    Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
    Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import {
    Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink,
    BreadcrumbSeparator, BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/* ────────────────────────────────────────────────────────────────────────
 * Mendr loader keyframes — defined once, used by the custom loaders below
 * ──────────────────────────────────────────────────────────────────────── */

const LOADER_KEYFRAMES = `
@keyframes mendr-stream-line {
    0%   { opacity: 0; transform: translateY(2px); }
    10%  { opacity: 1; transform: translateY(0); }
    85%  { opacity: 1; }
    100% { opacity: 0; }
}
@keyframes mendr-caret {
    0%, 49%   { opacity: 1; }
    50%, 100% { opacity: 0; }
}
@keyframes mendr-pulse-ring {
    0%   { transform: scale(0.6); opacity: 0.45; }
    100% { transform: scale(2.2); opacity: 0; }
}
@keyframes mendr-trade-cycle {
    0%, 18%  { opacity: 0.18; transform: scale(1); }
    20%, 28% { opacity: 1;    transform: scale(1.06); }
    32%, 100%{ opacity: 0.18; transform: scale(1); }
}
@keyframes mendr-step-fill {
    0%   { transform: scaleX(0); }
    100% { transform: scaleX(1); }
}
@keyframes mendr-dot-breathe {
    0%, 60%, 100% { transform: scale(0.6); opacity: 0.4; }
    30%           { transform: scale(1);   opacity: 1; }
}
@keyframes mendr-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}
`;

/* ────────────────────────────────────────────────────────────────────────
 * Layout primitives
 * ──────────────────────────────────────────────────────────────────────── */

function Section({ id, eyebrow, title, intro, children }: {
    id: string; eyebrow: string; title: string; intro?: string; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-20 space-y-8">
            <header className="space-y-3 border-b border-border/60 pb-5">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <p className="text-[11px] font-medium text-muted-foreground">{eyebrow}</p>
                </div>
                <h2 className="text-3xl font-semibold text-foreground">{title}</h2>
                {intro && (
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{intro}</p>
                )}
            </header>
            <div className="space-y-12">{children}</div>
        </section>
    );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}

function PreviewPair({ children, single = false }: { children: React.ReactNode; single?: boolean }) {
    if (single) {
        return <div className="rounded-xl border border-border bg-card p-6">{children}</div>;
    }
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-[#FAFAFA] p-6 text-[#151515]">
                <div className="mb-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5A5A5A]" />
                    <span className="text-[11px] font-medium text-[#5A5A5A]">Light</span>
                </div>
                <div className="font-sans text-[#151515]">{children}</div>
            </div>
            <div className="dark rounded-xl border border-[#2A2A2A] bg-[#111111] p-6 text-[#F0F0F0]">
                <div className="mb-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#888888]" />
                    <span className="text-[11px] font-medium text-[#888888]">Dark</span>
                </div>
                <div className="font-sans text-[#F0F0F0]">{children}</div>
            </div>
        </div>
    );
}

function Swatch({ hex, name, token, on = '#151515' }: { hex: string; name: string; token: string; on?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                void navigator.clipboard.writeText(hex);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
            }}
            className="group flex flex-col gap-2 text-left focus:outline-none"
        >
            <div
                className="relative h-16 w-full rounded-md border border-black/10 transition-transform group-hover:scale-[1.02]"
                style={{ background: hex }}
            >
                <span className="absolute bottom-1.5 left-2 text-[11px] font-semibold" style={{ color: on }}>Aa</span>
                <span className="absolute bottom-1.5 right-2 font-mono text-[9px]" style={{ color: on, opacity: 0.7 }}>
                    {copied ? '✓' : hex}
                </span>
            </div>
            <div>
                <p className="text-[12px] font-medium text-foreground">{name}</p>
                <p className="font-mono text-[10px] leading-tight text-muted-foreground">{token}</p>
            </div>
        </button>
    );
}

function TokenRow({ token, light, dark, note }: { token: string; light: string; dark: string; note?: string }) {
    return (
        <tr className="border-b border-border/40 text-xs">
            <td className="py-2.5 pl-4 pr-4 font-mono text-foreground">{token}</td>
            <td className="py-2.5 pr-4">
                <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 shrink-0 rounded-sm border border-black/10" style={{ background: light }} />
                    <span className="font-mono text-muted-foreground">{light}</span>
                </span>
            </td>
            <td className="py-2.5 pr-4">
                <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 shrink-0 rounded-sm border border-white/10" style={{ background: dark }} />
                    <span className="font-mono text-muted-foreground">{dark}</span>
                </span>
            </td>
            <td className="py-2.5 pr-4 text-muted-foreground hidden lg:table-cell">{note}</td>
        </tr>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Color scheme cards — five options to choose from
 * ──────────────────────────────────────────────────────────────────────── */

type Scheme = {
    id: string;
    name: string;
    personality: string;
    canvas: string;
    surface: string;
    ink: string;
    inkSoft: string;
    line: string;
    primary: string;
    primaryHover: string;
    primaryFg: string;
    accent?: string;
    why: string;
    risk?: string;
    recommended?: boolean;
};

const SCHEMES: Scheme[] = [
    {
        id: 'inkwell',
        name: 'Inkwell',
        personality: 'Near-monochrome. The canvas is the brand.',
        canvas: '#F1ECE2',
        surface: '#FBF8F2',
        ink: '#0E1110',
        inkSoft: '#5C5A52',
        line: '#E1DACA',
        primary: '#0E1110',
        primaryHover: '#1F2422',
        primaryFg: '#F1ECE2',
        accent: '#D9A93C',
        why: 'Bone-cream canvas is rare in software — most apps default to pure white. That single decision makes Mendr instantly recognisable. The primary is ink itself: every CTA reads as serious, considered, paper-and-ink. A warm citrine accent appears only on the live pip and the Verified mark, never on a button.',
        risk: 'Requires every page to be designed with the cream canvas in mind — no falling back to #FFFFFF cards by accident.',
        recommended: true,
    },
    {
        id: 'slate',
        name: 'Slate',
        personality: 'Cool, premium, conservative authority.',
        canvas: '#F6F7F9',
        surface: '#FFFFFF',
        ink: '#0B1622',
        inkSoft: '#54627A',
        line: '#E4E7EE',
        primary: '#22384E',
        primaryHover: '#162536',
        primaryFg: '#FFFFFF',
        accent: '#3E7BFA',
        why: 'A deep slate-blue, not the saturated SaaS-blue you see everywhere. Feels like a private bank or a Bloomberg terminal applied to home repair. Reads as quiet expertise. The brighter accent only appears on focus rings and live status.',
        risk: 'Risk of feeling cold or transactional if the surrounding photography and copy aren\'t warm.',
    },
    {
        id: 'terracotta',
        name: 'Terracotta',
        personality: 'Earth-warm, crafted, Western Cape.',
        canvas: '#F2EBE0',
        surface: '#FBF7EF',
        ink: '#241914',
        inkSoft: '#766B5F',
        line: '#E5DCCB',
        primary: '#B9532C',
        primaryHover: '#9A4424',
        primaryFg: '#FBF7EF',
        accent: '#241914',
        why: 'The actual colour of Cape Town soil and Cape Dutch architecture. Warm, human, regional. Distinguished from generic construction-orange because it sits in the clay range — earthy, not hi-vis. Matches the local visual vocabulary in a way no competitor does.',
        risk: 'Could read as a heritage / hospitality brand if not held in check by the editorial typography.',
    },
    {
        id: 'cobalt',
        name: 'Cobalt',
        personality: 'IKB-inspired. Bold, modern, confident.',
        canvas: '#F8F8FC',
        surface: '#FFFFFF',
        ink: '#0B0F1A',
        inkSoft: '#535A6D',
        line: '#E5E7EE',
        primary: '#1F3CD8',
        primaryHover: '#152BA8',
        primaryFg: '#FFFFFF',
        accent: '#FFD53D',
        why: 'A saturated cobalt closer to Yves Klein than to Material Blue. Used sparingly — primary action only — it becomes a single, unmistakable signal. The crisp snow canvas and high-contrast ink amplify the cobalt without surrounding it.',
        risk: 'Cobalt + white is also the Cape Town municipal palette and a common fintech move. Only works if held at small surface area.',
    },
    {
        id: 'citrine',
        name: 'Citrine',
        personality: 'The lime evolved — matte, mustard, expensive.',
        canvas: '#F4EFE6',
        surface: '#FBF8F2',
        ink: '#1A1610',
        inkSoft: '#6B6555',
        line: '#E5DECC',
        primary: '#D5B53A',
        primaryHover: '#B89A2A',
        primaryFg: '#1A1610',
        accent: '#1A1610',
        why: 'Keeps the citrus DNA of the current direction but de-saturates it from hi-vis lime into a mustard that reads as gold leaf rather than highlighter. Pairs naturally with the bone canvas. Closest to where the brand is today, with a meaningful step up in perceived quality.',
    },
];

function SchemeCard({ s }: { s: Scheme }) {
    return (
        <article
            className="overflow-hidden rounded-xl border"
            style={{ background: s.canvas, borderColor: s.line, color: s.ink }}
        >
            <header className="flex items-start justify-between gap-4 border-b px-6 pt-6 pb-5" style={{ borderColor: s.line }}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h4 className="text-xl font-semibold" style={{ color: s.ink }}>{s.name}</h4>
                        {s.recommended && (
                            <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{ background: s.ink, color: s.canvas }}
                            >
                                Recommended
                            </span>
                        )}
                    </div>
                    <p className="text-sm" style={{ color: s.inkSoft }}>{s.personality}</p>
                </div>
                {/* Live preview Verified mark using scheme colours */}
                <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: s.ink, color: s.canvas }}
                >
                    <ShieldCheck className="size-3.5" strokeWidth={2} />
                    Verified
                </span>
            </header>

            <div className="grid gap-6 px-6 py-6 md:grid-cols-[1fr_1fr]">
                {/* Swatches column */}
                <div className="space-y-3">
                    <p className="text-[11px] font-medium" style={{ color: s.inkSoft }}>Palette</p>
                    <div className="grid grid-cols-3 gap-2">
                        <SchemeSwatch hex={s.canvas} label="Canvas" textOn={s.ink} />
                        <SchemeSwatch hex={s.surface} label="Surface" textOn={s.ink} />
                        <SchemeSwatch hex={s.line} label="Line" textOn={s.ink} />
                        <SchemeSwatch hex={s.ink} label="Ink" textOn={s.canvas} />
                        <SchemeSwatch hex={s.primary} label="Primary" textOn={s.primaryFg} />
                        <SchemeSwatch hex={s.primaryHover} label="Hover" textOn={s.primaryFg} />
                    </div>
                </div>

                {/* Live previews column */}
                <div className="space-y-4">
                    <p className="text-[11px] font-medium" style={{ color: s.inkSoft }}>In use</p>
                    {/* Card mini */}
                    <div
                        className="space-y-3 rounded-lg border p-4"
                        style={{ background: s.surface, borderColor: s.line }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: s.accent ?? s.primary }} />
                            <p className="text-[11px] font-medium" style={{ color: s.inkSoft }}>Diagnosis · 14:32</p>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: s.ink }}>
                            Burnt wall socket in the kitchen
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: s.inkSoft }}>
                            Likely overheated connection. Switch off the circuit at the board before anything else.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                className="inline-flex h-9 items-center justify-center rounded-md border px-3.5 text-xs font-medium"
                                style={{ background: s.primary, color: s.primaryFg, borderColor: s.primary }}
                            >
                                Find an electrician
                            </button>
                            <button
                                className="inline-flex h-9 items-center justify-center rounded-md border bg-transparent px-3.5 text-xs font-medium"
                                style={{ borderColor: s.line, color: s.ink }}
                            >
                                Save report
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="space-y-2 border-t px-6 py-5" style={{ borderColor: s.line }}>
                <p className="text-xs leading-relaxed" style={{ color: s.ink }}>
                    <span className="font-medium">Why this works. </span>
                    <span style={{ color: s.inkSoft }}>{s.why}</span>
                </p>
                {s.risk && (
                    <p className="text-xs leading-relaxed" style={{ color: s.inkSoft }}>
                        <span className="font-medium" style={{ color: s.ink }}>Risk. </span>{s.risk}
                    </p>
                )}
            </footer>
        </article>
    );
}

function SchemeSwatch({ hex, label, textOn }: { hex: string; label: string; textOn: string }) {
    return (
        <div className="space-y-1.5">
            <div
                className="flex h-10 items-end justify-between rounded-md border border-black/10 px-2 pb-1.5"
                style={{ background: hex }}
            >
                <span className="text-[9px] font-medium" style={{ color: textOn }}>{label}</span>
                <span className="font-mono text-[8px]" style={{ color: textOn, opacity: 0.7 }}>{hex}</span>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Logo system — wordmark, monogram, app icon, favicon, monochrome variants
 * ──────────────────────────────────────────────────────────────────────── */

function Wordmark({ size = 32, withDot = true, color = 'currentColor', dotColor = 'var(--primary)' }: {
    size?: number; withDot?: boolean; color?: string; dotColor?: string;
}) {
    return (
        <span
            className="font-sans font-semibold"
            style={{ fontSize: size, lineHeight: 1, color }}
        >
            Mendr{withDot && <span style={{ color: dotColor }}>.</span>}
        </span>
    );
}

function Monogram({ size = 48, fg = 'var(--primary-foreground)', bg = 'var(--foreground)' }: {
    size?: number; fg?: string; bg?: string;
}) {
    return (
        <div
            className="inline-flex items-center justify-center font-sans font-semibold"
            style={{ width: size, height: size, background: bg, color: fg, borderRadius: size * 0.22, fontSize: size * 0.52 }}
        >
            M
        </div>
    );
}

function AppIcon({ size = 96 }: { size?: number }) {
    /* Squircle-ish app icon with ink M on cream/primary stripe at the base. */
    return (
        <div
            className="relative overflow-hidden font-sans font-semibold"
            style={{
                width: size,
                height: size,
                borderRadius: size * 0.22,
                background: 'var(--foreground)',
                color: 'var(--background)',
            }}
        >
            <span
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center"
                style={{ fontSize: size * 0.56, lineHeight: 1 }}
            >
                M
            </span>
            <span
                className="absolute bottom-0 left-0 right-0"
                style={{ height: size * 0.08, background: 'var(--primary)' }}
            />
        </div>
    );
}

function FaviconArt({ px }: { px: number }) {
    return (
        <div
            className="flex items-center justify-center font-sans font-semibold"
            style={{
                width: px,
                height: px,
                background: '#0E1110',
                color: '#F1ECE2',
                borderRadius: Math.max(px * 0.22, 2),
                fontSize: px * 0.62,
                lineHeight: 1,
            }}
        >
            M
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Custom Mendr motion loaders
 * ──────────────────────────────────────────────────────────────────────── */

function LoaderStream() {
    const lines = [
        'Reading the photo…',
        'Identifying the trade…',
        'Writing your diagnosis…',
    ];
    return (
        <div className="space-y-2.5">
            {lines.map((t, i) => (
                <div
                    key={t}
                    className="flex items-baseline gap-2 text-sm text-foreground"
                    style={{
                        animation: 'mendr-stream-line 3.6s ease-out infinite',
                        animationDelay: `${i * 1.2}s`,
                        opacity: 0,
                    }}
                >
                    <span>{t}</span>
                    {i === lines.length - 1 && (
                        <span
                            className="inline-block h-3.5 w-[2px] bg-foreground"
                            style={{ animation: 'mendr-caret 1s steps(2) infinite' }}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

function LoaderPulseRing() {
    return (
        <div className="relative flex h-16 w-16 items-center justify-center">
            {[0, 0.6, 1.2].map((d, i) => (
                <span
                    key={i}
                    className="absolute size-3 rounded-full border-2 border-primary"
                    style={{
                        animation: 'mendr-pulse-ring 1.8s ease-out infinite',
                        animationDelay: `${d}s`,
                    }}
                />
            ))}
            <span className="relative size-2.5 rounded-full bg-primary" />
        </div>
    );
}

function LoaderTradeScan() {
    const TRADES = [
        { I: Droplets, n: 'Plumbing' },
        { I: Zap,       n: 'Electrical' },
        { I: Flame,     n: 'HVAC' },
        { I: Hammer,    n: 'Carpentry' },
        { I: HomeIcon,  n: 'Roofing' },
    ];
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                {TRADES.map(({ I, n }, i) => (
                    <div
                        key={n}
                        className="flex flex-col items-center gap-1"
                        style={{
                            animation: 'mendr-trade-cycle 2.5s ease-in-out infinite',
                            animationDelay: `${i * 0.5}s`,
                        }}
                    >
                        <I className="size-5 text-foreground" strokeWidth={1.5} />
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">Classifying the trade…</p>
        </div>
    );
}

function LoaderStepBar({ active = 2 }: { active?: number }) {
    const steps = ['Received', 'Reading', 'Writing', 'Matching'];
    return (
        <div className="space-y-3">
            <div className="flex gap-1.5">
                {steps.map((_, i) => {
                    const filled = i < active;
                    const isActive = i === active;
                    return (
                        <div key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                                className="absolute inset-y-0 left-0 origin-left bg-primary"
                                style={{
                                    width: '100%',
                                    transform: filled ? 'scaleX(1)' : isActive ? undefined : 'scaleX(0)',
                                    animation: isActive ? 'mendr-step-fill 1.8s ease-out infinite' : undefined,
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                {steps.map((s, i) => (
                    <span
                        key={s}
                        className={i === active ? 'font-medium text-foreground' : 'text-muted-foreground'}
                    >
                        {s}
                    </span>
                ))}
            </div>
        </div>
    );
}

function LoaderDots() {
    return (
        <div className="inline-flex items-center gap-1.5">
            {[0, 0.18, 0.36].map((d, i) => (
                <span
                    key={i}
                    className="size-1.5 rounded-full bg-foreground"
                    style={{
                        animation: 'mendr-dot-breathe 1.4s ease-in-out infinite',
                        animationDelay: `${d}s`,
                    }}
                />
            ))}
        </div>
    );
}

function LoaderShimmer({ lines = 3 }: { lines?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: lines }).map((_, i) => (
                <div
                    key={i}
                    className="h-3 rounded"
                    style={{
                        width: i === lines - 1 ? '55%' : '100%',
                        backgroundImage: 'linear-gradient(90deg, var(--muted) 0%, var(--accent) 50%, var(--muted) 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'mendr-shimmer 1.6s ease-in-out infinite',
                    }}
                />
            ))}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Branded form controls (the look we should ship in shadcn Input/Textarea)
 * ──────────────────────────────────────────────────────────────────────── */

const BRAND_INPUT_BASE =
    'flex h-11 w-full rounded-md border bg-card px-3.5 text-sm text-foreground ' +
    'placeholder:text-muted-foreground transition-[box-shadow,border-color] ' +
    'shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] ' +
    'focus:outline-none focus:border-foreground ' +
    'focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_35%,transparent)] ' +
    'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';

function BrandInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={`${BRAND_INPUT_BASE} ${props.className ?? ''}`} style={{ borderColor: 'var(--border)' }} />;
}

function BrandInputError(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            aria-invalid
            className={
                'flex h-11 w-full rounded-md border bg-card px-3.5 text-sm text-foreground ' +
                'placeholder:text-muted-foreground transition-[box-shadow,border-color] ' +
                'border-destructive focus:outline-none ' +
                'focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--destructive)_25%,transparent)] ' +
                (props.className ?? '')
            }
        />
    );
}

function BrandTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={
                'block w-full rounded-md border bg-card px-3.5 py-3 text-sm text-foreground ' +
                'placeholder:text-muted-foreground transition-[box-shadow,border-color] ' +
                'shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] resize-y ' +
                'focus:outline-none focus:border-foreground ' +
                'focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_35%,transparent)] ' +
                (props.className ?? '')
            }
            style={{ borderColor: 'var(--border)' }}
        />
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Brand-specific composed components
 * ──────────────────────────────────────────────────────────────────────── */

const TRADE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    plumbing:   { label: 'Plumbing',   icon: Droplets },
    electrical: { label: 'Electrical', icon: Zap },
    roofing:    { label: 'Roofing',    icon: HomeIcon },
    hvac:       { label: 'HVAC',       icon: Flame },
    general:    { label: 'General',    icon: Wrench },
    painting:   { label: 'Painting',   icon: Paintbrush },
    carpentry:  { label: 'Carpentry',  icon: Hammer },
};

function TradeChip({ trade }: { trade: keyof typeof TRADE_META }) {
    const meta = TRADE_META[trade];
    const Icon = meta.icon;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
            <Icon className="size-3.5 text-muted-foreground" />
            {meta.label}
        </span>
    );
}

type Severity = 'monitor' | 'act-soon' | 'urgent';
const SEVERITY: Record<Severity, { label: string; dot: string; bg: string; fg: string }> = {
    'monitor':  { label: 'Monitor',  dot: '#16A34A', bg: '#DCFCE7', fg: '#166534' },
    'act-soon': { label: 'Act soon', dot: '#D97706', bg: '#FEF3C7', fg: '#92400E' },
    'urgent':   { label: 'Urgent',   dot: '#DC2626', bg: '#FEE2E2', fg: '#991B1B' },
};

function SeverityPill({ level }: { level: Severity }) {
    const s = SEVERITY[level];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: s.bg, color: s.fg }}
        >
            <span className="size-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label}
        </span>
    );
}

function VerifiedMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
    const px = size === 'lg' ? 'h-7 px-2.5 text-xs' : 'h-6 px-2 text-[11px]';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full bg-foreground text-background font-medium ${px}`}>
            <ShieldCheck className="size-3.5" strokeWidth={2} />
            Verified on Mendr
        </span>
    );
}

function CertificationChip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Check className="size-3 text-foreground" />
            {children}
        </span>
    );
}

function ProcessingStep({ status, label, sub }: { status: 'done' | 'active' | 'pending'; label: string; sub?: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {status === 'done' && <CheckCircle2 className="size-5 text-foreground" />}
                {status === 'active' && <Loader2 className="size-5 animate-spin text-foreground" />}
                {status === 'pending' && <Circle className="size-5 text-muted-foreground" />}
            </div>
            <div className="space-y-0.5">
                <p className={`text-sm ${status === 'pending' ? 'text-muted-foreground' : 'text-foreground'} ${status === 'active' ? 'font-medium' : ''}`}>
                    {label}
                </p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
        </div>
    );
}

function HazardCallout() {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#991B1B]" />
            <div className="space-y-1">
                <p className="text-sm font-semibold text-[#991B1B]">Safety hazard — do not use</p>
                <p className="text-sm leading-relaxed text-[#7F1D1D]">
                    Scorch marks around the socket suggest active arcing. Switch off this circuit at the
                    distribution board before anything else.
                </p>
            </div>
        </div>
    );
}

function ContractorCard() {
    return (
        <article className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30">
            <div className="relative aspect-[4/3] bg-[#F0EEE7]">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Camera className="size-10" strokeWidth={1.5} />
                </div>
                <div className="absolute left-3 top-3"><VerifiedMark /></div>
                <button className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1">
                    {[0,1,2,3].map(i => (
                        <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-4 bg-foreground' : 'w-1.5 bg-foreground/30'}`} />
                    ))}
                </button>
            </div>
            <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                        <h4 className="text-base font-semibold text-foreground">Cape Plumb Co.</h4>
                        <p className="text-xs text-muted-foreground">Observatory, Cape Town</p>
                    </div>
                    <div className="text-right">
                        <p className="inline-flex items-center gap-1 text-sm font-medium">
                            <Star className="size-3.5 fill-foreground text-foreground" />
                            4.9
                        </p>
                        <p className="text-[11px] text-muted-foreground">128 reviews</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> 2.4 km</span>
                    <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> 8 min drive</span>
                    <span className="inline-flex items-center gap-1 text-[#166534]"><span className="size-1.5 rounded-full bg-[#16A34A]" /> Open now</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <TradeChip trade="plumbing" />
                    <CertificationChip>PIRB</CertificationChip>
                    <CertificationChip>+2 more</CertificationChip>
                </div>

                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    Family-run plumbers covering the southern suburbs since 2008. Specialise in geyser
                    replacements, leak detection, and burst-pipe call-outs. Same-day service for emergencies.
                </p>

                <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1">View profile</Button>
                    <Button size="sm" className="flex-1">Contact</Button>
                </div>
            </div>
        </article>
    );
}

function DiagnosisReportBlock() {
    return (
        <article className="space-y-5 rounded-xl border border-border bg-card p-6">
            <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <TradeChip trade="electrical" />
                    <SeverityPill level="urgent" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                    Burnt wall socket in the kitchen — likely overheated connection
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Estimated time to fix: 1–2 hours · Typical cost: R650–R1,200 · Trade: Qualified electrician (Wireman&apos;s licence)
                </p>
            </header>

            <HazardCallout />

            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">What we&apos;re seeing</p>
                <p className="text-sm leading-relaxed text-foreground">
                    The scorch pattern around the live terminal is consistent with a loose connection that has
                    been overheating for some time. Plastic discolouration extends past the faceplate, which
                    suggests the heat has reached the back box. This is not a cosmetic issue.
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">What to do next</p>
                <ol className="space-y-2 text-sm leading-relaxed text-foreground">
                    {[
                        'Switch off the kitchen circuit at the distribution board.',
                        'Do not plug anything else into nearby sockets until inspected.',
                        'Call a registered electrician — this needs a Certificate of Compliance check, not a swap-out.',
                    ].map((line, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">{i + 1}</span>
                            <span>{line}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </article>
    );
}

function EvidencePhoto() {
    return (
        <figure className="space-y-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded border border-border bg-[#EFEDE4]">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Camera className="size-8" strokeWidth={1.5} />
                </div>
                <span className="absolute right-2 top-2 rounded bg-foreground/90 px-1.5 py-0.5 font-mono text-[10px] text-background">1 / 3</span>
            </div>
            <figcaption className="text-xs text-muted-foreground">Photo by homeowner · uploaded 14:32</figcaption>
        </figure>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────── */

const NAV = [
    { id: 'foundations', label: 'Foundations' },
    { id: 'voice',       label: 'Voice' },
    { id: 'schemes',     label: 'Color schemes' },
    { id: 'color',       label: 'Color tokens' },
    { id: 'type',        label: 'Type' },
    { id: 'logos',       label: 'Logos' },
    { id: 'space',       label: 'Space & layout' },
    { id: 'radius',      label: 'Radius' },
    { id: 'elevation',   label: 'Elevation' },
    { id: 'motion',      label: 'Motion' },
    { id: 'loaders',     label: 'Loaders' },
    { id: 'icons',       label: 'Icons' },
    { id: 'imagery',     label: 'Imagery' },
    { id: 'buttons',     label: 'Buttons' },
    { id: 'badges',      label: 'Badges' },
    { id: 'forms',       label: 'Forms' },
    { id: 'feedback',    label: 'Feedback' },
    { id: 'navigation',  label: 'Navigation' },
    { id: 'surfaces',    label: 'Surfaces' },
    { id: 'overlays',    label: 'Overlays' },
    { id: 'data',        label: 'Data display' },
    { id: 'diagnosis',   label: 'Diagnosis' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'states',      label: 'States' },
    { id: 'chrome',      label: 'Chrome' },
] as const;

export default function BrandingClient() {
    return (
        <TooltipProvider>
            <style dangerouslySetInnerHTML={{ __html: LOADER_KEYFRAMES }} />

            <div className="min-h-screen bg-background font-sans">

                {/* ── Sticky nav ─────────────────────────────────────────── */}
                <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
                    <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2.5 lg:px-8">
                        <span className="mr-2 shrink-0 text-[13px] font-semibold">Mendr · Design System</span>
                        <Separator orientation="vertical" className="mr-2 h-4 shrink-0" />
                        {NAV.map((n) => (
                            <a
                                key={n.id}
                                href={`#${n.id}`}
                                className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                {n.label}
                            </a>
                        ))}
                    </div>
                </div>

                <div className="mx-auto max-w-7xl space-y-24 px-6 py-12 lg:px-8">

                    {/* ══ HERO ═════════════════════════════════════════════ */}
                    <header className="space-y-6 pt-4">
                        <Badge variant="outline" className="text-xs">v1.0 · Canonical</Badge>
                        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] text-foreground">
                            The visual language of Mendr.
                        </h1>
                        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                            A homeowner photographs something broken. Within sixty seconds they receive a calm,
                            written diagnosis and a shortlist of vetted contractors who can actually fix it.
                            Every visual decision in this system answers one question — <em>does this make a
                            stranger feel safe</em>. Quiet confidence, real content, no theatre.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button size="lg">Get diagnosis</Button>
                            <Button size="lg" variant="outline">View live app</Button>
                        </div>
                    </header>

                    {/* ══ FOUNDATIONS ══════════════════════════════════════ */}
                    <Section
                        id="foundations"
                        eyebrow="01 · Foundations"
                        title="Principles"
                        intro="Six rules that override everything else when in doubt."
                    >
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {[
                                { n: '01', t: 'Trust over delight', d: 'Every pixel answers: does this make a stranger feel safe spending money on a stranger.' },
                                { n: '02', t: 'Editorial, not SaaS', d: 'Closer to a newspaper or a doctor’s letter than to a dashboard. Content carries the weight.' },
                                { n: '03', t: 'One signal',          d: 'The primary appears only on the most important action, the live status pip, and the Verified mark. Everywhere else: ink, canvas, line.' },
                                { n: '04', t: 'Lines, not shadows',  d: 'Hairlines divide content. Shadows are reserved for true overlays — dialog, popover, sheet.' },
                                { n: '05', t: 'Plain language',      d: 'Second person, concrete numbers, no marketing adjectives. “Here’s what’s wrong” beats “Discover the truth”.' },
                                { n: '06', t: 'Calm motion',         d: '150–220 ms ease-out budget. No springs. No motion on the diagnosis path.' },
                            ].map(p => (
                                <div key={p.n} className="space-y-2 rounded-xl border border-border bg-card p-5">
                                    <p className="font-mono text-[11px] text-muted-foreground">{p.n}</p>
                                    <h4 className="text-base font-semibold text-foreground">{p.t}</h4>
                                    <p className="text-sm leading-relaxed text-muted-foreground">{p.d}</p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* ══ VOICE ═════════════════════════════════════════════ */}
                    <Section
                        id="voice"
                        eyebrow="02 · Voice"
                        title="How Mendr talks"
                        intro="Spoken aloud, the product should sound like an honest, calm tradesperson — never like a chatbot, never like a brochure."
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-5">
                                <p className="text-xs font-medium text-[#166534]">Do</p>
                                {[
                                    '“Here’s what’s wrong, and what to do about it.”',
                                    '“Switch off the circuit at the board before anything else.”',
                                    '“You’ll get a written report in about 60 seconds.”',
                                    '“No account, no spam, no obligation.”',
                                ].map((t, i) => <p key={i} className="text-sm leading-relaxed text-[#14532D]">{t}</p>)}
                            </div>
                            <div className="space-y-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5">
                                <p className="text-xs font-medium text-[#991B1B]">Don&apos;t</p>
                                {[
                                    '“Unlock the truth about your home with AI-powered insights.”',
                                    '“Our cutting-edge platform leverages…”',
                                    '“Discover what’s really going on.”',
                                    '“Sign up now to unlock premium features!”',
                                ].map((t, i) => <p key={i} className="text-sm leading-relaxed text-[#7F1D1D] line-through decoration-[#FCA5A5]/60">{t}</p>)}
                            </div>
                        </div>
                    </Section>

                    {/* ══ COLOR SCHEMES ════════════════════════════════════ */}
                    <Section
                        id="schemes"
                        eyebrow="03 · Color schemes"
                        title="Five directions, one to pick"
                        intro="The current lime is functional but generic. These five options each propose a different personality — pick one, the rest of the system follows. Recommended one marked. Each card uses its scheme’s real colours throughout, so what you see is what you get."
                    >
                        <div className="space-y-5">
                            {SCHEMES.map(s => <SchemeCard key={s.id} s={s} />)}
                        </div>

                        <div className="rounded-xl border border-border bg-muted/40 p-5 text-xs leading-relaxed text-muted-foreground">
                            <p className="font-medium text-foreground">A note on what makes a scheme &ldquo;immediately recognisable&rdquo;.</p>
                            <p className="mt-2">
                                It is rarely the primary colour. Linear, Notion, Stripe, Things, Vercel — none of those are remembered
                                for the hue of their CTA. They are remembered for what their <em>canvas</em> feels like, how restrained
                                their accent is, and how confident their typography sits on it. The strongest move Mendr can make is to
                                pick a canvas that is not pure white — that single decision pulls the brand out of the SaaS pile before
                                a single user has clicked anything. The bone-cream canvas in <strong>Inkwell</strong> is that move.
                            </p>
                        </div>
                    </Section>

                    {/* ══ COLOR TOKENS ═════════════════════════════════════ */}
                    <Section
                        id="color"
                        eyebrow="04 · Color tokens"
                        title="The current production palette"
                        intro="Whichever scheme is chosen above, these are the token slots that need values. The list below is the lime baseline that ships today."
                    >
                        <Group title="Brand palette — current">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
                                <Swatch hex="#151515" name="Ink"            token="--menda-ink" on="#FAFAFA" />
                                <Swatch hex="#5A5A5A" name="Ink secondary"  token="--menda-ink-secondary" on="#FAFAFA" />
                                <Swatch hex="#FAFAFA" name="Canvas"         token="--menda-canvas" />
                                <Swatch hex="#FFFFFF" name="Surface"        token="--menda-surface" />
                                <Swatch hex="#EAEAEA" name="Line"           token="--menda-line" />
                                <Swatch hex="#DDEE22" name="Primary"        token="--menda-primary" />
                                <Swatch hex="#CCDD11" name="Primary hover"  token="--primary-hover" />
                                <Swatch hex="#0066BB" name="Link"           token="--menda-link" on="#FFFFFF" />
                            </div>
                        </Group>

                        <Group title="Status — diagnosis severity & system feedback">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                                <Swatch hex="#16A34A" name="Success"      token="status.success" on="#FFFFFF" />
                                <Swatch hex="#DCFCE7" name="Success soft" token="status.success-soft" />
                                <Swatch hex="#D97706" name="Warning"      token="status.warning" on="#FFFFFF" />
                                <Swatch hex="#FEF3C7" name="Warning soft" token="status.warning-soft" />
                                <Swatch hex="#DC2626" name="Danger"       token="--destructive" on="#FFFFFF" />
                                <Swatch hex="#FEE2E2" name="Danger soft"  token="status.danger-soft" />
                            </div>
                        </Group>

                        <Group title="Token map — light & dark">
                            <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full min-w-[560px]">
                                    <thead className="border-b border-border bg-muted/40">
                                        <tr className="text-xs font-medium text-muted-foreground">
                                            <th className="py-2.5 pl-4 pr-4 text-left">Token</th>
                                            <th className="py-2.5 pr-4 text-left">Light</th>
                                            <th className="py-2.5 pr-4 text-left">Dark</th>
                                            <th className="py-2.5 pr-4 text-left hidden lg:table-cell">Use</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <TokenRow token="--background"          light="#FAFAFA" dark="#111111" note="Page canvas" />
                                        <TokenRow token="--foreground"          light="#151515" dark="#F0F0F0" note="All body text" />
                                        <TokenRow token="--card"                light="#FFFFFF" dark="#1A1A1A" note="Raised content blocks" />
                                        <TokenRow token="--popover"             light="#FFFFFF" dark="#1A1A1A" note="Floating overlays" />
                                        <TokenRow token="--primary"             light="#DDEE22" dark="#DDEE22" note="The single signal — CTAs, status pip, Verified mark" />
                                        <TokenRow token="--primary-foreground"  light="#151515" dark="#111111" note="Stays dark on lime in both themes" />
                                        <TokenRow token="--primary-hover"       light="#CCDD11" dark="#CCDD11" note="Button hover only" />
                                        <TokenRow token="--secondary / --muted / --accent" light="#F5F5F5" dark="#222222" note="All three unified — one neutral fill" />
                                        <TokenRow token="--muted-foreground"    light="#5A5A5A" dark="#888888" note="Captions, meta text" />
                                        <TokenRow token="--border / --input"    light="#EAEAEA" dark="#2A2A2A" note="Hairline divides — primary divider" />
                                        <TokenRow token="--ring"                light="#AAAAAA" dark="#666666" note="Focus ring — grey on purpose, not primary" />
                                        <TokenRow token="--destructive"         light="#DD3333" dark="#DD3333" note="Errors, destructive actions" />
                                        <TokenRow token="--menda-link"          light="#0066BB" dark="#4499DD" note="Inline links — AA on canvas" />
                                    </tbody>
                                </table>
                            </div>
                        </Group>
                    </Section>

                    {/* ══ TYPE ══════════════════════════════════════════════ */}
                    <Section
                        id="type"
                        eyebrow="05 · Type"
                        title="Sohne — four weights, default tracking"
                        intro="Light (300) and Extrafett (900) are removed from the system. Default letter-spacing is the rule — no tracking-tight on headings, no extended tracking on uppercase. The four weights below cover everything."
                    >
                        <Group title="Weights — 400 / 500 / 600 / 700">
                            <div className="space-y-3 rounded-xl border border-border bg-card p-6">
                                {[
                                    { w: '400 · Buch',            cls: 'font-normal' },
                                    { w: '500 · Kräftig',         cls: 'font-medium' },
                                    { w: '600 · Halbfett',        cls: 'font-semibold' },
                                    { w: '700 · Dreiviertelfett', cls: 'font-bold' },
                                ].map(({ w, cls }) => (
                                    <div key={w} className="flex items-baseline gap-6 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                                        <span className="w-44 shrink-0 font-mono text-[11px] text-muted-foreground">{w}</span>
                                        <span className={`text-2xl ${cls}`}>Diagnose before you call</span>
                                    </div>
                                ))}
                            </div>
                        </Group>

                        <Group title="Scale">
                            <div className="space-y-1 rounded-xl border border-border bg-card p-6">
                                {[
                                    { cls: 'text-5xl font-semibold leading-[1.08]',  label: '48 / 1.08', usage: 'Display — landing hero' },
                                    { cls: 'text-4xl font-semibold leading-[1.12]',  label: '36 / 1.12', usage: 'H1 — page title' },
                                    { cls: 'text-3xl font-semibold leading-[1.2]',   label: '30 / 1.2',  usage: 'H2 — section heading' },
                                    { cls: 'text-2xl font-semibold leading-[1.25]',  label: '24 / 1.25', usage: 'H3 — sub-section' },
                                    { cls: 'text-xl  font-semibold leading-[1.3]',   label: '20 / 1.3',  usage: 'H4 — card title' },
                                    { cls: 'text-base font-normal leading-[1.6]',    label: '16 / 1.6',  usage: 'Body — diagnosis prose, long-form' },
                                    { cls: 'text-sm font-normal leading-[1.5]',      label: '14 / 1.5',  usage: 'Body small — UI default' },
                                    { cls: 'text-xs font-medium leading-[1.4]',      label: '12 / 1.4',  usage: 'Meta — captions, helper, eyebrow' },
                                ].map(({ cls, label, usage }) => (
                                    <div key={label} className="flex items-baseline gap-6 border-b border-border/40 py-3 last:border-b-0">
                                        <span className="w-32 shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
                                        <span className={cls}>The quiet authority of a written diagnosis</span>
                                        <span className="ml-auto hidden text-[11px] text-muted-foreground md:inline">{usage}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                Note how the eyebrows in this document are <strong>sentence case</strong> with a small bullet — not uppercase. Uppercase
                                without added tracking reads as crowded, and the rule for this system is default tracking everywhere. The result
                                is calmer, more editorial.
                            </p>
                        </Group>

                        <Group title="Specimens — in context">
                            <PreviewPair>
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground">Diagnosis · written 14:32</p>
                                    <h3 className="text-2xl font-semibold leading-tight">Burnt wall socket in the kitchen</h3>
                                    <p className="text-base leading-relaxed text-muted-foreground">
                                        The scorch pattern around the live terminal is consistent with a loose connection
                                        that has been overheating for some time. Plastic discolouration extends past the
                                        faceplate, which suggests the heat has reached the back box.
                                    </p>
                                </div>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ LOGOS ════════════════════════════════════════════ */}
                    <Section
                        id="logos"
                        eyebrow="06 · Logos"
                        title="One wordmark, four marks, two icons"
                        intro="Every surface the product touches has a logo slot. These are the canonical forms — wordmark with terminal dot for marketing, monogram for tight spaces, app icon for installs, favicon for tabs."
                    >
                        <Group title="Wordmark — primary">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="flex flex-col items-start gap-6 rounded-xl border border-border bg-card p-10">
                                    <Wordmark size={56} />
                                    <p className="text-xs text-muted-foreground">Primary · light surface · 56 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-6 rounded-xl border border-[#2A2A2A] bg-[#111111] p-10">
                                    <Wordmark size={56} color="#F0F0F0" />
                                    <p className="text-xs text-[#888888]">Primary · dark surface · 56 px</p>
                                </div>
                            </div>
                        </Group>

                        <Group title="Wordmark — sizes & monochrome">
                            <div className="flex flex-wrap items-end gap-x-10 gap-y-8 rounded-xl border border-border bg-card p-8">
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={48} />
                                    <p className="text-[10px] text-muted-foreground">48 — H1</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={32} />
                                    <p className="text-[10px] text-muted-foreground">32 — H2</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={20} />
                                    <p className="text-[10px] text-muted-foreground">20 — nav</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={14} />
                                    <p className="text-[10px] text-muted-foreground">14 — footer</p>
                                </div>
                                <Separator orientation="vertical" className="h-12" />
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={32} dotColor="currentColor" />
                                    <p className="text-[10px] text-muted-foreground">Mono · stamps, print, fax</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Wordmark size={32} withDot={false} />
                                    <p className="text-[10px] text-muted-foreground">No-dot · inline body copy</p>
                                </div>
                            </div>
                        </Group>

                        <Group title="Monogram — for tight spaces, avatars, watermarks">
                            <div className="flex flex-wrap items-end gap-6 rounded-xl border border-border bg-card p-8">
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={64} />
                                    <p className="text-[10px] text-muted-foreground">64 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={48} />
                                    <p className="text-[10px] text-muted-foreground">48 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={32} />
                                    <p className="text-[10px] text-muted-foreground">32 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={24} />
                                    <p className="text-[10px] text-muted-foreground">24 px</p>
                                </div>
                                <Separator orientation="vertical" className="h-16" />
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={48} bg="var(--primary)" fg="var(--primary-foreground)" />
                                    <p className="text-[10px] text-muted-foreground">Primary tile</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Monogram size={48} bg="transparent" fg="var(--foreground)" />
                                    <p className="text-[10px] text-muted-foreground">Outline-on-canvas</p>
                                </div>
                            </div>
                        </Group>

                        <Group title="App icon — iOS / Android / PWA install">
                            <div className="flex flex-wrap items-end gap-8 rounded-xl border border-border bg-card p-8">
                                <div className="flex flex-col items-start gap-2">
                                    <AppIcon size={120} />
                                    <p className="text-[10px] text-muted-foreground">1024 master (shown at 120)</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <AppIcon size={88} />
                                    <p className="text-[10px] text-muted-foreground">180 — iOS @3x</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <AppIcon size={60} />
                                    <p className="text-[10px] text-muted-foreground">120 — iOS @2x</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <AppIcon size={48} />
                                    <p className="text-[10px] text-muted-foreground">72 — Android xxhdpi</p>
                                </div>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                The lime stripe at the base is the icon&apos;s only colour. On the homescreen, surrounded by app icons that
                                are mostly gradients and circles, the dark monogram with a single horizontal lime line is the recognisable bit.
                            </p>
                        </Group>

                        <Group title="Favicon — browser tabs, bookmarks">
                            <div className="flex flex-wrap items-end gap-8 rounded-xl border border-border bg-card p-8">
                                <div className="flex flex-col items-start gap-2">
                                    <FaviconArt px={48} />
                                    <p className="text-[10px] text-muted-foreground">48 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <FaviconArt px={32} />
                                    <p className="text-[10px] text-muted-foreground">32 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <FaviconArt px={24} />
                                    <p className="text-[10px] text-muted-foreground">24 px</p>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <FaviconArt px={16} />
                                    <p className="text-[10px] text-muted-foreground">16 px — tab</p>
                                </div>
                            </div>
                        </Group>

                        <Group title="Clear space & don’ts">
                            <div className="grid gap-4 md:grid-cols-2 rounded-xl border border-border bg-card p-6">
                                <div className="space-y-3">
                                    <p className="text-sm font-medium">Clear space</p>
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                        Always reserve clear space equal to the cap-height of the wordmark on every side. No other element may
                                        intrude — including dividers, photo edges, and other type.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-sm font-medium">Never</p>
                                    <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                        <li>· Don&apos;t change the colour of the wordmark to anything other than ink, canvas, or full mono.</li>
                                        <li>· Don&apos;t add a shadow, outline, or gradient to the wordmark or monogram.</li>
                                        <li>· Don&apos;t place the wordmark on the primary lime — there is no approved primary-on-primary use.</li>
                                        <li>· Don&apos;t set the wordmark in any weight other than 600.</li>
                                    </ul>
                                </div>
                            </div>
                        </Group>
                    </Section>

                    {/* ══ SPACING ══════════════════════════════════════════ */}
                    <Section
                        id="space"
                        eyebrow="07 · Space & layout"
                        title="A four-pixel rhythm"
                        intro="All spacing is a multiple of 4. Section paddings stay generous so content can breathe."
                    >
                        <Group title="Scale">
                            <div className="space-y-2 rounded-xl border border-border bg-card p-6">
                                {[
                                    { name: '1',  px: '4',  cls: 'h-1'  },
                                    { name: '2',  px: '8',  cls: 'h-2'  },
                                    { name: '3',  px: '12', cls: 'h-3'  },
                                    { name: '4',  px: '16', cls: 'h-4'  },
                                    { name: '6',  px: '24', cls: 'h-6'  },
                                    { name: '8',  px: '32', cls: 'h-8'  },
                                    { name: '12', px: '48', cls: 'h-12' },
                                    { name: '16', px: '64', cls: 'h-16' },
                                    { name: '24', px: '96', cls: 'h-24' },
                                ].map(s => (
                                    <div key={s.name} className="flex items-center gap-4 border-b border-border/40 py-1.5 last:border-b-0">
                                        <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{s.name}</span>
                                        <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">{s.px}px</span>
                                        <span className={`block bg-foreground ${s.cls}`} style={{ width: '100%', maxWidth: `${parseInt(s.px) * 4}px` }} />
                                    </div>
                                ))}
                            </div>
                        </Group>

                        <Group title="Container & section padding">
                            <div className="space-y-3 rounded-xl border border-border bg-card p-6">
                                <Row k="Max content width"    v="1280px (max-w-7xl)" />
                                <Row k="Reading width"        v="680px (max-w-2xl) — used for diagnosis prose, long-form copy" />
                                <Row k="Section padding · y"  v="py-14 mobile · py-20 desktop" />
                                <Row k="Section padding · x"  v="px-6 mobile · px-8 desktop" />
                                <Row k="Card padding"         v="p-5 (compact) · p-6 (default)" />
                                <Row k="Stack gap · default"  v="space-y-6" />
                                <Row k="Stack gap · tight"    v="space-y-3" />
                                <Row k="Label → input"        v="space-y-3 (12 px) — every label sits exactly gap-3 above its control" />
                            </div>
                        </Group>
                    </Section>

                    {/* ══ RADIUS ═══════════════════════════════════════════ */}
                    <Section
                        id="radius"
                        eyebrow="08 · Radius"
                        title="Soft, never bubbly"
                        intro="Base radius is 8px. Pills are full. Photos round only slightly — we want them to read as photos, not stickers."
                    >
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                            {[
                                { name: 'none',     cls: 'rounded-none',   token: 'rounded-none' },
                                { name: 'sm · 4',   cls: 'rounded-sm',     token: '--radius-sm' },
                                { name: 'md · 6',   cls: 'rounded-md',     token: '--radius-md' },
                                { name: 'lg · 8',   cls: 'rounded-lg',     token: '--radius-lg · base' },
                                { name: 'xl · 12',  cls: 'rounded-xl',     token: '--radius-xl' },
                                { name: '2xl · 16', cls: 'rounded-2xl',    token: '--radius-2xl' },
                                { name: '3xl · 20', cls: 'rounded-3xl',    token: '--radius-3xl' },
                                { name: '4xl · 24', cls: 'rounded-[24px]', token: '--radius-4xl' },
                                { name: 'full',     cls: 'rounded-full',   token: 'pills, avatars' },
                            ].map(r => (
                                <div key={r.name} className="space-y-2">
                                    <div className={`h-20 w-full border border-border bg-card ${r.cls}`} />
                                    <p className="text-xs font-medium">{r.name}</p>
                                    <p className="font-mono text-[10px] text-muted-foreground">{r.token}</p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* ══ ELEVATION ═══════════════════════════════════════ */}
                    <Section
                        id="elevation"
                        eyebrow="09 · Elevation"
                        title="Borders first, shadows only for overlays"
                        intro="Static content uses a 1px line. Anything that floats — a dialog, a sheet, a dropdown — earns a shadow."
                    >
                        <div className="grid gap-4 md:grid-cols-3">
                            {[
                                { name: '0 · Hairline',  cls: 'border border-border',                           use: 'Default. Static cards, dividers.' },
                                { name: '1 · Subtle',    cls: 'border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]', use: 'Hover lift on interactive cards.' },
                                { name: '2 · Floating',  cls: 'border border-border shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.04)]', use: 'Popovers, tooltips, dropdowns.' },
                                { name: '3 · Modal',     cls: 'border border-border shadow-[0_24px_56px_-12px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.06)]', use: 'Dialogs, sheets.' },
                            ].map(e => (
                                <div key={e.name} className="space-y-3 rounded-xl bg-muted/40 p-6">
                                    <div className={`flex h-24 items-center justify-center rounded-lg bg-card ${e.cls}`}>
                                        <span className="text-xs font-medium text-muted-foreground">{e.name}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{e.use}</p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* ══ MOTION ══════════════════════════════════════════ */}
                    <Section
                        id="motion"
                        eyebrow="10 · Motion"
                        title="Calm, fast, honest"
                        intro="No motion for motion's sake. Durations and easings below — anything beyond these is off-system."
                    >
                        <Group title="Durations & easings">
                            <div className="space-y-2 rounded-xl border border-border bg-card p-6">
                                <Row k="micro"     v="80 ms · ease-out · press feedback, hover colour swap" />
                                <Row k="short"     v="150 ms · ease-out · default — most state changes" />
                                <Row k="medium"    v="220 ms · ease-out · sheet, dialog, popover open" />
                                <Row k="long"     v="320 ms · ease-out · page transition, hero reveal" />
                                <Row k="never use" v="spring physics, parallax, motion on /diagnosis or /processing" />
                            </div>
                        </Group>
                    </Section>

                    {/* ══ CUSTOM LOADERS ══════════════════════════════════ */}
                    <Section
                        id="loaders"
                        eyebrow="11 · Loaders"
                        title="Loading states that feel like the product"
                        intro="Five loaders, each tied to a specific moment in the flow. Generic spinners only appear inside buttons. Everywhere else, use the loader that matches what the system is actually doing."
                    >
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <LoaderCard
                                name="Stream"
                                when="While the diagnosis is being written"
                                detail="Three lines fade in, in order, with a blinking caret on the live line. Sequential, deliberate, like watching a person type."
                            >
                                <LoaderStream />
                            </LoaderCard>

                            <LoaderCard
                                name="Pulse ring"
                                when="During AI thinking, before any text is ready"
                                detail="The lime pip emits expanding concentric rings. Slow enough not to fidget. The only ambient motion the system uses."
                            >
                                <LoaderPulseRing />
                            </LoaderCard>

                            <LoaderCard
                                name="Trade scan"
                                when="During trade classification"
                                detail="Five trade icons. One lights up at a time as the model considers each. Tells the user what work is actually happening — not just that work is happening."
                            >
                                <LoaderTradeScan />
                            </LoaderCard>

                            <LoaderCard
                                name="Step bar"
                                when="Across the multi-step processing page"
                                detail="Four segments, one per pipeline step. The active segment fills repeatedly while the step runs. Done segments stay solid lime."
                            >
                                <LoaderStepBar active={2} />
                            </LoaderCard>

                            <LoaderCard
                                name="Breathing dots"
                                when="Inline, in buttons or rows — when something tiny is loading"
                                detail="Three ink dots that scale-breathe in sequence. Quietest loader; appears at sizes too small for anything else."
                            >
                                <LoaderDots />
                            </LoaderCard>

                            <LoaderCard
                                name="Shimmer skeleton"
                                when="While a card or row is fetching"
                                detail="Bars sized to match the missing content with a subtle highlight passing across. Never used to mask a button — only structural content."
                            >
                                <LoaderShimmer />
                            </LoaderCard>
                        </div>
                    </Section>

                    {/* ══ ICONS ═══════════════════════════════════════════ */}
                    <Section
                        id="icons"
                        eyebrow="12 · Icons"
                        title="Lucide — and nothing else"
                        intro="One library, 1.5px stroke, only three sizes: 16, 20, 24. Heroicons and Tabler are being removed."
                    >
                        <Group title="Sizes">
                            <div className="flex items-end gap-8 rounded-xl border border-border bg-card p-6">
                                {[{ s: 'size-4', px: '16' }, { s: 'size-5', px: '20' }, { s: 'size-6', px: '24' }].map(o => (
                                    <div key={o.px} className="space-y-2 text-center">
                                        <Wrench className={`mx-auto ${o.s} text-foreground`} strokeWidth={1.5} />
                                        <p className="font-mono text-[10px] text-muted-foreground">{o.px}px</p>
                                    </div>
                                ))}
                            </div>
                        </Group>

                        <Group title="The icons we actually use">
                            <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-6 lg:grid-cols-10">
                                {[
                                    { I: HomeIcon, n: 'Home' }, { I: Wrench, n: 'Wrench' }, { I: Zap, n: 'Zap' }, { I: Droplets, n: 'Droplets' },
                                    { I: Flame, n: 'Flame' }, { I: Hammer, n: 'Hammer' }, { I: Paintbrush, n: 'Paintbrush' },
                                    { I: Camera, n: 'Camera' }, { I: Upload, n: 'Upload' }, { I: FileText, n: 'FileText' },
                                    { I: ShieldCheck, n: 'ShieldCheck' }, { I: CheckCircle2, n: 'CheckCircle2' }, { I: AlertTriangle, n: 'AlertTriangle' },
                                    { I: TriangleAlert, n: 'TriangleAlert' }, { I: Info, n: 'Info' }, { I: HelpCircle, n: 'HelpCircle' },
                                    { I: Star, n: 'Star' }, { I: MapPin, n: 'MapPin' }, { I: Clock, n: 'Clock' }, { I: Calendar, n: 'Calendar' },
                                    { I: Phone, n: 'Phone' }, { I: Mail, n: 'Mail' }, { I: MessageCircle, n: 'MessageCircle' },
                                    { I: Search, n: 'Search' }, { I: Filter, n: 'Filter' }, { I: Settings, n: 'Settings' },
                                    { I: User, n: 'User' }, { I: Bell, n: 'Bell' }, { I: Lock, n: 'Lock' },
                                    { I: ArrowRight, n: 'ArrowRight' }, { I: ArrowLeft, n: 'ArrowLeft' }, { I: ArrowUpRight, n: 'ArrowUpRight' },
                                    { I: ChevronRight, n: 'ChevronRight' }, { I: ChevronDown, n: 'ChevronDown' },
                                    { I: Plus, n: 'Plus' }, { I: X, n: 'X' }, { I: Menu, n: 'Menu' }, { I: MoreHorizontal, n: 'MoreHorizontal' },
                                    { I: Edit3, n: 'Edit3' }, { I: Trash2, n: 'Trash2' }, { I: Copy, n: 'Copy' }, { I: Share2, n: 'Share2' },
                                    { I: Download, n: 'Download' }, { I: ExternalLink, n: 'ExternalLink' }, { I: RefreshCw, n: 'RefreshCw' },
                                    { I: Eye, n: 'Eye' }, { I: Sparkles, n: 'Sparkles' },
                                ].map(({ I, n }) => (
                                    <div key={n} className="group flex flex-col items-center gap-1.5 rounded-md p-2 hover:bg-muted">
                                        <I className="size-5 text-foreground" strokeWidth={1.5} />
                                        <span className="font-mono text-[9px] text-muted-foreground">{n}</span>
                                    </div>
                                ))}
                            </div>
                        </Group>
                    </Section>

                    {/* ══ IMAGERY ═══════════════════════════════════════════ */}
                    <Section
                        id="imagery"
                        eyebrow="13 · Imagery"
                        title="Photos are evidence, not decoration"
                        intro="User-uploaded photos sit in a 4:3 frame with a hairline border and only 4px of rounding. Marketing photography stays muted-natural — never the blue-stock-gradient look."
                    >
                        <div className="grid gap-6 md:grid-cols-3">
                            <EvidencePhoto />
                            <EvidencePhoto />
                            <EvidencePhoto />
                        </div>
                    </Section>

                    {/* ══ BUTTONS ═══════════════════════════════════════════ */}
                    <Section
                        id="buttons"
                        eyebrow="14 · Buttons"
                        title="Six variants, five sizes"
                        intro="Default primary is reserved for the single primary action on a screen. Outline is the neutral worker. Ghost is for tertiary affordances inside dense UI."
                    >
                        <Group title="Variants — default size">
                            <PreviewPair>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button>Get diagnosis</Button>
                                    <Button variant="outline">Cancel</Button>
                                    <Button variant="secondary">Save draft</Button>
                                    <Button variant="ghost">Skip</Button>
                                    <Button variant="destructive">Delete report</Button>
                                    <Button variant="link">View terms</Button>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Sizes">
                            <PreviewPair single>
                                <div className="flex flex-wrap items-end gap-3">
                                    <Button size="xs">XS</Button>
                                    <Button size="sm">Small</Button>
                                    <Button>Default</Button>
                                    <Button size="lg">Large</Button>
                                    <Button size="xl">XL — Hero CTA</Button>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="With icons">
                            <PreviewPair single>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button><Upload className="size-4" /> Upload photo</Button>
                                    <Button variant="outline"><Phone className="size-4" /> Call now</Button>
                                    <Button variant="ghost">Skip step <ArrowRight className="size-4" /></Button>
                                    <Button size="icon" variant="outline" aria-label="Settings"><Settings className="size-4" /></Button>
                                    <Button size="icon-sm" variant="ghost" aria-label="Close"><X className="size-4" /></Button>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="States">
                            <PreviewPair single>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">Default</p>
                                        <Button className="w-full">Get diagnosis</Button>
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">Hover</p>
                                        <Button className="w-full" style={{ background: 'var(--primary-hover)', borderColor: 'var(--primary-hover)' }}>Get diagnosis</Button>
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">Loading</p>
                                        <Button className="w-full" disabled><LoaderDots /> Generating</Button>
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">Disabled</p>
                                        <Button className="w-full" disabled>Get diagnosis</Button>
                                    </div>
                                </div>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ BADGES ════════════════════════════════════════════ */}
                    <Section
                        id="badges"
                        eyebrow="15 · Badges"
                        title="Quiet markers, not labels"
                        intro="Use sparingly. A page of badges is a page that has lost its hierarchy."
                    >
                        <Group title="Variants">
                            <PreviewPair>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge>Primary</Badge>
                                    <Badge variant="secondary">Secondary</Badge>
                                    <Badge variant="outline">Outline</Badge>
                                    <Badge variant="destructive">Destructive</Badge>
                                    <Badge variant="ghost">Ghost</Badge>
                                    <Badge><Sparkles className="size-3" /> With icon</Badge>
                                </div>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ FORMS — branded inputs, gap-3 ═══════════════════ */}
                    <Section
                        id="forms"
                        eyebrow="16 · Forms"
                        title="Inputs — Mendr-branded"
                        intro="These are not stock shadcn. The focus state uses a soft 3px halo in the primary, the border darkens to ink, and there is a faint inner highlight to make the field feel recessed. Every label sits exactly 12 px (gap-3) above its control."
                    >
                        <Group title="Anatomy">
                            <PreviewPair single>
                                <div className="grid gap-8 md:grid-cols-2">
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-1">Default</Label>
                                        <BrandInput id="bd-1" placeholder="What’s broken?" />
                                        <p className="text-xs text-muted-foreground">A short description helps the diagnosis.</p>
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-2">Filled</Label>
                                        <BrandInput id="bd-2" defaultValue="Kitchen socket smells like burning" />
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-3" className="flex items-center gap-1.5">
                                            Focus state
                                            <span className="text-[10px] font-normal text-muted-foreground">(autofocus on click)</span>
                                        </Label>
                                        <BrandInput id="bd-3" placeholder="Click me — see the lime halo" />
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-4">Disabled</Label>
                                        <BrandInput id="bd-4" disabled defaultValue="Locked while diagnosis runs" />
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-5" className="text-destructive">Error</Label>
                                        <BrandInputError id="bd-5" defaultValue="" placeholder="Required" />
                                        <p className="text-xs text-destructive">Please describe the problem in at least a sentence.</p>
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bd-6">With leading icon</Label>
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <BrandInput id="bd-6" placeholder="Search contractors" className="pl-10" />
                                        </div>
                                    </div>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Textarea">
                            <PreviewPair single>
                                <div className="space-y-3 max-w-xl">
                                    <Label htmlFor="ds-5">Describe the problem</Label>
                                    <BrandTextarea
                                        id="ds-5"
                                        rows={4}
                                        placeholder="When did you first notice it? Does anything make it worse?"
                                    />
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Select · Checkbox · Radio · Switch · Slider">
                            <PreviewPair single>
                                <div className="grid gap-8 md:grid-cols-2">
                                    <div className="space-y-3 max-w-xs">
                                        <Label htmlFor="sel-1">Trade</Label>
                                        <div className="relative">
                                            <select
                                                id="sel-1"
                                                defaultValue="electrical"
                                                className={`${BRAND_INPUT_BASE} appearance-none pr-10`}
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                <option value="plumbing">Plumbing</option>
                                                <option value="electrical">Electrical</option>
                                                <option value="hvac">HVAC</option>
                                                <option value="roofing">Roofing</option>
                                            </select>
                                            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Filters</Label>
                                        <div className="flex items-center gap-2">
                                            <Checkbox id="cb-1" defaultChecked />
                                            <Label htmlFor="cb-1" className="font-normal">Open now</Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox id="cb-2" />
                                            <Label htmlFor="cb-2" className="font-normal">Verified only</Label>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Urgency</Label>
                                        <RadioGroup defaultValue="act-soon" className="gap-2">
                                            <div className="flex items-center gap-2"><RadioGroupItem value="monitor" id="r1" /><Label htmlFor="r1" className="font-normal">Monitor</Label></div>
                                            <div className="flex items-center gap-2"><RadioGroupItem value="act-soon" id="r2" /><Label htmlFor="r2" className="font-normal">Act soon</Label></div>
                                            <div className="flex items-center gap-2"><RadioGroupItem value="urgent" id="r3" /><Label htmlFor="r3" className="font-normal">Urgent</Label></div>
                                        </RadioGroup>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="sw-1" className="font-normal">Notify me of new matches</Label>
                                            <Switch id="sw-1" defaultChecked />
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <Label className="font-normal">Distance</Label>
                                                <span className="font-mono text-muted-foreground">5 km</span>
                                            </div>
                                            <Slider defaultValue={[5]} min={1} max={25} step={1} />
                                        </div>
                                    </div>
                                </div>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ FEEDBACK ══════════════════════════════════════════ */}
                    <Section
                        id="feedback"
                        eyebrow="17 · Feedback"
                        title="Alerts, progress, loading"
                        intro="System feedback uses status colours; loading uses the loaders defined above."
                    >
                        <Group title="Alerts">
                            <div className="space-y-3">
                                <Alert>
                                    <Info className="size-4" />
                                    <AlertTitle>You can close this tab</AlertTitle>
                                    <AlertDescription>We&apos;ll text you a link when the diagnosis is ready — usually within a minute.</AlertDescription>
                                </Alert>
                                <Alert className="border-[#FCA5A5] bg-[#FEF2F2] text-[#7F1D1D]">
                                    <TriangleAlert className="size-4 text-[#991B1B]" />
                                    <AlertTitle className="text-[#991B1B]">Something went wrong</AlertTitle>
                                    <AlertDescription>We couldn&apos;t process this photo. Try a clearer shot in good light.</AlertDescription>
                                </Alert>
                                <Alert className="border-[#BBF7D0] bg-[#F0FDF4] text-[#14532D]">
                                    <CheckCircle2 className="size-4 text-[#166534]" />
                                    <AlertTitle className="text-[#166534]">Report ready</AlertTitle>
                                    <AlertDescription>Your diagnosis is finished. We&apos;ve also lined up three nearby contractors.</AlertDescription>
                                </Alert>
                            </div>
                        </Group>

                        <Group title="Progress">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                                    <p className="text-xs font-medium">Determinate</p>
                                    <Progress value={62} />
                                    <p className="text-xs text-muted-foreground">62% · uploading photo</p>
                                </div>
                                <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                                    <p className="text-xs font-medium">Indeterminate (loader)</p>
                                    <LoaderPulseRing />
                                </div>
                                <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                                    <p className="text-xs font-medium">Skeleton</p>
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-5/6" />
                                    </div>
                                </div>
                            </div>
                        </Group>

                        <Group title="Toasts (Sonner)">
                            <div className="space-y-3 rounded-xl border border-border bg-card p-6">
                                <ToastSample tone="default" icon={<Info className="size-4" />} title="Saved" body="Your diagnosis is in your inbox." />
                                <ToastSample tone="success" icon={<CheckCircle2 className="size-4 text-[#166534]" />} title="Sent to contractor" body="Reply usually within 4 hours." />
                                <ToastSample tone="error"   icon={<TriangleAlert className="size-4 text-[#991B1B]" />} title="Couldn’t upload" body="Try again on a stronger connection." />
                            </div>
                        </Group>
                    </Section>

                    {/* ══ NAVIGATION ══════════════════════════════════════ */}
                    <Section
                        id="navigation"
                        eyebrow="18 · Navigation"
                        title="Tabs, breadcrumbs, accordions"
                    >
                        <Group title="Tabs">
                            <PreviewPair single>
                                <Tabs defaultValue="diagnosis" className="max-w-xl">
                                    <TabsList>
                                        <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
                                        <TabsTrigger value="evidence">Evidence</TabsTrigger>
                                        <TabsTrigger value="contractors">Contractors</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="diagnosis" className="pt-4 text-sm text-muted-foreground">
                                        The written diagnosis from the AI, plus recommended next steps.
                                    </TabsContent>
                                    <TabsContent value="evidence" className="pt-4 text-sm text-muted-foreground">
                                        Original photo, plus any additional images requested.
                                    </TabsContent>
                                    <TabsContent value="contractors" className="pt-4 text-sm text-muted-foreground">
                                        Three vetted contractors near you who can fix this.
                                    </TabsContent>
                                </Tabs>
                            </PreviewPair>
                        </Group>

                        <Group title="Breadcrumb">
                            <PreviewPair single>
                                <Breadcrumb>
                                    <BreadcrumbList>
                                        <BreadcrumbItem><BreadcrumbLink href="#">Home</BreadcrumbLink></BreadcrumbItem>
                                        <BreadcrumbSeparator />
                                        <BreadcrumbItem><BreadcrumbLink href="#">Reports</BreadcrumbLink></BreadcrumbItem>
                                        <BreadcrumbSeparator />
                                        <BreadcrumbItem><BreadcrumbPage>Kitchen socket</BreadcrumbPage></BreadcrumbItem>
                                    </BreadcrumbList>
                                </Breadcrumb>
                            </PreviewPair>
                        </Group>

                        <Group title="Accordion">
                            <PreviewPair single>
                                <Accordion type="single" collapsible className="max-w-xl">
                                    {[
                                        { q: 'How long does the diagnosis take?', a: 'About 60 seconds from upload to written report.' },
                                        { q: 'Is this a replacement for a real tradesperson?', a: 'No. The diagnosis is a head-start — the real work still gets done by a qualified human.' },
                                        { q: 'How are contractors vetted?', a: 'Documents, certifications, reviews from past Mendr customers, and a manual check.' },
                                    ].map((item, i) => (
                                        <AccordionItem key={i} value={`v${i}`}>
                                            <AccordionTrigger>{item.q}</AccordionTrigger>
                                            <AccordionContent>{item.a}</AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ SURFACES ════════════════════════════════════════ */}
                    <Section
                        id="surfaces"
                        eyebrow="19 · Surfaces"
                        title="Cards"
                        intro="The card is the dominant container. Always a single hairline, never a heavy shadow."
                    >
                        <Group title="Card anatomy">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Cape Plumb Co.</CardTitle>
                                        <CardDescription>Verified plumber · Observatory, Cape Town</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground">
                                            Family-run plumbers covering the southern suburbs since 2008. Same-day service for emergencies.
                                        </p>
                                    </CardContent>
                                    <CardFooter className="gap-2">
                                        <Button variant="outline" size="sm">View profile</Button>
                                        <Button size="sm">Contact</Button>
                                    </CardFooter>
                                </Card>
                                <Card className="bg-muted/40 border-dashed">
                                    <CardHeader>
                                        <CardTitle>Subtle variant</CardTitle>
                                        <CardDescription>Muted background, dashed border — used for empty states and optional content.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button variant="outline" size="sm"><Plus className="size-4" /> Add another photo</Button>
                                    </CardContent>
                                </Card>
                            </div>
                        </Group>
                    </Section>

                    {/* ══ OVERLAYS ════════════════════════════════════════ */}
                    <Section
                        id="overlays"
                        eyebrow="20 · Overlays"
                        title="Dialogs, sheets, popovers, tooltips"
                        intro="The only place shadows live."
                    >
                        <PreviewPair single>
                            <div className="flex flex-wrap items-center gap-3">
                                <Dialog>
                                    <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Leave diagnosis?</DialogTitle>
                                            <DialogDescription>Your progress will be saved — you can come back to this at any time.</DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter>
                                            <Button variant="outline">Stay</Button>
                                            <Button variant="destructive">Leave</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <Sheet>
                                    <SheetTrigger asChild><Button variant="outline">Open sheet</Button></SheetTrigger>
                                    <SheetContent>
                                        <SheetHeader>
                                            <SheetTitle>Filters</SheetTitle>
                                            <SheetDescription>Narrow the contractor list by trade, distance, and availability.</SheetDescription>
                                        </SheetHeader>
                                        <div className="space-y-4 px-4">
                                            <div className="space-y-3">
                                                <Label>Distance</Label>
                                                <Slider defaultValue={[5]} min={1} max={25} step={1} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="sf1" className="font-normal">Open now</Label>
                                                <Switch id="sf1" defaultChecked />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="sf2" className="font-normal">Verified only</Label>
                                                <Switch id="sf2" />
                                            </div>
                                        </div>
                                        <SheetFooter>
                                            <Button variant="ghost">Reset</Button>
                                            <Button>Apply</Button>
                                        </SheetFooter>
                                    </SheetContent>
                                </Sheet>

                                <Popover>
                                    <PopoverTrigger asChild><Button variant="outline">Open popover</Button></PopoverTrigger>
                                    <PopoverContent className="w-72">
                                        <div className="space-y-2">
                                            <p className="text-sm font-semibold">Contact options</p>
                                            <Button variant="outline" size="sm" className="w-full justify-start"><Phone className="size-4" /> Call now</Button>
                                            <Button variant="outline" size="sm" className="w-full justify-start"><MessageCircle className="size-4" /> WhatsApp</Button>
                                            <Button variant="outline" size="sm" className="w-full justify-start"><Mail className="size-4" /> Email</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" aria-label="Help"><HelpCircle className="size-4" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Verified contractors have passed manual checks.</TooltipContent>
                                </Tooltip>
                            </div>
                        </PreviewPair>
                    </Section>

                    {/* ══ DATA DISPLAY ════════════════════════════════════ */}
                    <Section
                        id="data"
                        eyebrow="21 · Data display"
                        title="Avatar, separator, key-value rows"
                    >
                        <Group title="Avatars">
                            <PreviewPair single>
                                <div className="flex items-center gap-3">
                                    <Avatar><AvatarFallback>CP</AvatarFallback></Avatar>
                                    <Avatar><AvatarFallback className="bg-primary text-primary-foreground">M</AvatarFallback></Avatar>
                                    <Avatar><AvatarFallback>JS</AvatarFallback></Avatar>
                                    <Avatar><AvatarFallback>+3</AvatarFallback></Avatar>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Key-value rows">
                            <PreviewPair single>
                                <dl className="divide-y divide-border rounded-lg border border-border bg-card">
                                    <Kv k="Trade"            v="Electrical" />
                                    <Kv k="Severity"         v={<SeverityPill level="urgent" />} />
                                    <Kv k="Estimated cost"   v="R650 – R1,200" />
                                    <Kv k="Time to fix"      v="1 – 2 hours" />
                                    <Kv k="Contractors near" v="3 within 5 km" />
                                </dl>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ DIAGNOSIS PATTERNS ══════════════════════════════ */}
                    <Section
                        id="diagnosis"
                        eyebrow="22 · Diagnosis patterns"
                        title="First-class primitives for the report flow"
                        intro="These exist because diagnosis is the product. Defined here, used identically on /diagnosis, /processing, and /report."
                    >
                        <Group title="Trade chip">
                            <PreviewPair>
                                <div className="flex flex-wrap gap-2">
                                    <TradeChip trade="plumbing" />
                                    <TradeChip trade="electrical" />
                                    <TradeChip trade="hvac" />
                                    <TradeChip trade="roofing" />
                                    <TradeChip trade="painting" />
                                    <TradeChip trade="carpentry" />
                                    <TradeChip trade="general" />
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Severity pill">
                            <PreviewPair>
                                <div className="flex flex-wrap gap-2">
                                    <SeverityPill level="monitor" />
                                    <SeverityPill level="act-soon" />
                                    <SeverityPill level="urgent" />
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Hazard callout">
                            <PreviewPair single><HazardCallout /></PreviewPair>
                        </Group>

                        <Group title="Processing step indicator">
                            <PreviewPair single>
                                <div className="max-w-md space-y-4">
                                    <ProcessingStep status="done"   label="Photo received" sub="2.1 MB · processed in 0.3s" />
                                    <ProcessingStep status="done"   label="Reviewing photo evidence" sub="Detected: electrical fault" />
                                    <ProcessingStep status="active" label="Generating diagnosis" sub="Usually 30–60 seconds" />
                                    <ProcessingStep status="pending" label="Matching nearby contractors" />
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Full diagnosis report block">
                            <DiagnosisReportBlock />
                        </Group>
                    </Section>

                    {/* ══ MARKETPLACE PATTERNS ════════════════════════════ */}
                    <Section
                        id="marketplace"
                        eyebrow="23 · Marketplace patterns"
                        title="Contractor cards, certifications, reviews"
                        intro="The shop window. Every choice here should reduce a homeowner’s anxiety about hiring a stranger."
                    >
                        <Group title="Verified mark">
                            <PreviewPair>
                                <div className="flex flex-wrap items-center gap-3">
                                    <VerifiedMark />
                                    <VerifiedMark size="lg" />
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Certification chips">
                            <PreviewPair single>
                                <div className="flex flex-wrap gap-1.5">
                                    <CertificationChip>PIRB</CertificationChip>
                                    <CertificationChip>Wireman&apos;s licence</CertificationChip>
                                    <CertificationChip>IOPSA member</CertificationChip>
                                    <CertificationChip>CIDB Grade 2</CertificationChip>
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Review row">
                            <PreviewPair single>
                                <div className="max-w-xl space-y-4">
                                    {[
                                        { author: 'Thandi M.', when: 'Last month', rating: 5, body: 'Came out within two hours of the diagnosis going through. Fixed the geyser, no upsell, fair price.' },
                                        { author: 'Pieter S.', when: '3 weeks ago', rating: 5, body: 'Honest about what didn’t need replacing. That alone earned the five stars.' },
                                        { author: 'Lerato K.', when: 'Yesterday',   rating: 4, body: 'Quick to arrive and tidy work. Lost a star for the 30-minute wait on the quote.' },
                                    ].map((r, i) => (
                                        <div key={i} className="space-y-2 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="size-7"><AvatarFallback className="text-[10px]">{r.author.split(' ').map(p => p[0]).join('')}</AvatarFallback></Avatar>
                                                    <p className="text-sm font-medium">{r.author}</p>
                                                    <p className="text-xs text-muted-foreground">· {r.when}</p>
                                                </div>
                                                <div className="flex items-center gap-0.5">
                                                    {Array.from({ length: 5 }).map((_, n) => (
                                                        <Star key={n} className={`size-3.5 ${n < r.rating ? 'fill-foreground text-foreground' : 'text-muted-foreground'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                                        </div>
                                    ))}
                                </div>
                            </PreviewPair>
                        </Group>

                        <Group title="Contractor card — full">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                <ContractorCard />
                                <ContractorCard />
                                <ContractorCard />
                            </div>
                        </Group>

                        <Group title="Trust strip">
                            <PreviewPair single>
                                <div className="flex flex-wrap items-center justify-around gap-6 rounded-xl border border-border bg-card px-6 py-5">
                                    {[
                                        { I: ShieldCheck, t: 'Vetted contractors', s: 'Documents & references checked' },
                                        { I: Clock,       t: '60-second report',    s: 'No call, no email, no account' },
                                        { I: MapPin,      t: 'Local to Cape Town',  s: 'Western Cape only — for now' },
                                        { I: Star,        t: 'Real reviews',        s: 'From past Mendr customers' },
                                    ].map(({ I, t, s }) => (
                                        <div key={t} className="flex items-center gap-3">
                                            <I className="size-5 text-foreground" strokeWidth={1.5} />
                                            <div>
                                                <p className="text-sm font-medium">{t}</p>
                                                <p className="text-xs text-muted-foreground">{s}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ══ STATES ══════════════════════════════════════════ */}
                    <Section
                        id="states"
                        eyebrow="24 · States"
                        title="Empty, error, success"
                        intro="The boring states are the ones people hit. Treat them like first-class screens."
                    >
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
                                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-background ring-1 ring-border">
                                    <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
                                </div>
                                <p className="text-sm font-semibold">No reports yet</p>
                                <p className="text-xs text-muted-foreground">When you diagnose something, it&apos;ll show up here.</p>
                                <Button size="sm">Start a diagnosis</Button>
                            </div>
                            <div className="space-y-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-8 text-center">
                                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-[#FCA5A5]">
                                    <TriangleAlert className="size-5 text-[#991B1B]" strokeWidth={1.5} />
                                </div>
                                <p className="text-sm font-semibold text-[#991B1B]">We couldn&apos;t process this photo</p>
                                <p className="text-xs text-[#7F1D1D]">Try a clearer shot in good light, or describe the fault in words.</p>
                                <Button size="sm" variant="outline" className="border-[#FCA5A5] text-[#991B1B] hover:bg-[#FEE2E2]">Try again</Button>
                            </div>
                            <div className="space-y-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-8 text-center">
                                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-[#BBF7D0]">
                                    <CheckCircle2 className="size-5 text-[#166534]" strokeWidth={1.5} />
                                </div>
                                <p className="text-sm font-semibold text-[#166534]">Diagnosis sent</p>
                                <p className="text-xs text-[#14532D]">Three contractors will be in touch within four hours.</p>
                            </div>
                        </div>
                    </Section>

                    {/* ══ CHROME ══════════════════════════════════════════ */}
                    <Section
                        id="chrome"
                        eyebrow="25 · App chrome"
                        title="Header & footer"
                        intro="The frame around every page."
                    >
                        <Group title="Marketing header">
                            <PreviewPair single>
                                <header className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-3.5">
                                    <div className="flex items-center gap-8">
                                        <Wordmark size={20} />
                                        <nav className="hidden items-center gap-6 md:flex">
                                            {['How it works', 'For contractors', 'About', 'Pricing'].map(l => (
                                                <a key={l} href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{l}</a>
                                            ))}
                                        </nav>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm">Sign in</Button>
                                        <Button size="sm">Get diagnosis</Button>
                                    </div>
                                </header>
                            </PreviewPair>
                        </Group>

                        <Group title="Footer">
                            <PreviewPair single>
                                <footer className="rounded-xl border border-border bg-card p-6">
                                    <div className="grid gap-8 md:grid-cols-4">
                                        <div className="space-y-3">
                                            <Wordmark size={20} />
                                            <p className="text-xs leading-relaxed text-muted-foreground">
                                                Diagnose home faults before you call. Made in Cape Town.
                                            </p>
                                        </div>
                                        {[
                                            { h: 'Product',  l: ['Get diagnosis', 'How it works', 'Pricing'] },
                                            { h: 'For pros', l: ['Join Mendr', 'Contractor portal', 'Help'] },
                                            { h: 'Company',  l: ['About', 'Privacy', 'Terms'] },
                                        ].map(col => (
                                            <div key={col.h} className="space-y-3">
                                                <p className="text-xs font-medium text-muted-foreground">{col.h}</p>
                                                {col.l.map(item => (
                                                    <a key={item} href="#" className="block text-xs text-foreground transition-colors hover:text-muted-foreground">{item}</a>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    <Separator className="my-6" />
                                    <p className="text-[11px] text-muted-foreground">© 2026 Mendr. Western Cape, South Africa.</p>
                                </footer>
                            </PreviewPair>
                        </Group>
                    </Section>

                    {/* ── Footer ─────────────────────────────────────────── */}
                    <footer className="border-t border-border pt-8 text-xs text-muted-foreground">
                        Canonical reference · update only when the system itself changes.
                    </footer>
                </div>
            </div>
        </TooltipProvider>
    );
}

/* ────────────────────────────────────────────────────────────────────────
 * Tiny inline helpers
 * ──────────────────────────────────────────────────────────────────────── */

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-baseline justify-between gap-6 border-b border-border/40 py-2 last:border-b-0">
            <span className="text-xs font-medium text-foreground">{k}</span>
            <span className="font-mono text-[11px] text-muted-foreground text-right">{v}</span>
        </div>
    );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-6 px-5 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
            <dd className="text-sm text-foreground">{v}</dd>
        </div>
    );
}

function ToastSample({ tone, icon, title, body }: { tone: 'default' | 'success' | 'error'; icon: React.ReactNode; title: string; body: string }) {
    const ring = tone === 'success' ? 'ring-[#BBF7D0]' : tone === 'error' ? 'ring-[#FCA5A5]' : 'ring-border';
    return (
        <div className={`flex max-w-md items-start gap-3 rounded-lg bg-card p-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] ring-1 ${ring}`}>
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div className="space-y-0.5">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
            </div>
            <button className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss">
                <X className="size-3.5" />
            </button>
        </div>
    );
}

function LoaderCard({ name, when, detail, children }: { name: string; when: string; detail: string; children: React.ReactNode }) {
    return (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-[10px] text-muted-foreground">{when}</p>
            </div>
            <div className="flex min-h-[88px] items-center justify-center rounded-lg bg-muted/40 p-6">
                {children}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
        </div>
    );
}
