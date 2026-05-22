'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
    Sheet, SheetContent, SheetDescription, SheetFooter,
    SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
    AlertTriangle, ArrowRight, BadgeCheck, Bell, Camera,
    CheckCircle, ChevronRight, Clock, Droplets, Hammer,
    Home, Image, Info, MapPin, Phone, Plus,
    Search, ShieldCheck, Star, Upload, Wind, Wrench, X, Zap,
} from 'lucide-react';

import { BRAND_NAME, BRAND_TAGLINE, mendrCopyGuidelines } from '@/lib/brand-system';
import { mendrTokens } from '@/lib/design-tokens';

// ─── Card style constants (div-level, not button) ────────────────────────────

const card         = 'rounded-lg border border-[#EBEBEB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)]';
const cardMuted    = 'rounded-lg border border-[#EBEBEB] bg-[#FAFAFA]';
const cardHighlight = 'rounded-lg border border-[#DCF763] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)]';
const cardElevated = 'rounded-lg border border-[#EBEBEB] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]';

/**
 * Shared Input className — applied via the shadcn Input component.
 * text-[16px] on mobile prevents iOS auto-zoom; md:text-[14px] renders
 * 14px on desktop.
 */
const inputClass = [
    'rounded-md border-[#EBEBEB] bg-white',
    'text-[16px] md:text-[14px] text-[#131312]',
    'placeholder:text-[#B0B0A8]',
    'focus-visible:ring-2 focus-visible:ring-[#DCF763] focus-visible:ring-offset-0 focus-visible:border-transparent',
].join(' ');

const textareaClass = [
    'rounded-md border-[#EBEBEB] bg-white',
    'text-[16px] md:text-[14px] text-[#131312]',
    'placeholder:text-[#B0B0A8]',
    'focus-visible:ring-2 focus-visible:ring-[#DCF763] focus-visible:ring-offset-0 focus-visible:border-transparent',
    'min-h-[6rem] resize-none',
].join(' ');

// ─── Domain tokens ────────────────────────────────────────────────────────────

const urgencyStyles = {
    monitor:    { label: 'Monitor',  bg: '#DCFCE7', color: '#166534' },
    'act-soon': { label: 'Act Soon', bg: '#FEF3C7', color: '#92400E' },
    urgent:     { label: 'Urgent',   bg: '#FEE2E2', color: '#991B1B' },
} as const;
type UrgencyKey = keyof typeof urgencyStyles;

const tradeStyles = {
    plumbing:              { label: 'Plumbing',              bg: '#DCFCE7', color: '#166534' },
    electrical:            { label: 'Electrical',            bg: '#EFF6FF', color: '#1D4ED8' },
    roofing:               { label: 'Roofing',               bg: '#F5F3FF', color: '#6D28D9' },
    'security-access':     { label: 'Security and Access',   bg: '#FFF7ED', color: '#C2410C' },
    hvac:                  { label: 'HVAC',                  bg: '#F0FDFB', color: '#0F766E' },
    appliances:            { label: 'Appliances',            bg: '#FDF2F8', color: '#9D174D' },
    'damp-waterproofing':  { label: 'Damp and Waterproofing',bg: '#EFF6FF', color: '#1E40AF' },
    handyman:              { label: 'Handyman',              bg: '#F5F5F4', color: '#44403C' },
} as const;
type TradeKey = keyof typeof tradeStyles;

// ─── Copy examples ────────────────────────────────────────────────────────────

const copyExamples = [
    {
        context: 'Step 1 Prompt',
        do: 'Tell us what\'s happening at home',
        avoid: 'Please enter a description of your home maintenance issue',
        rule: 'Imperative opener. No "please", no jargon. Never use a question mark.',
    },
    {
        context: 'Diagnosis Title',
        do: 'Ceiling Pipe Leak',
        avoid: 'Potential plumbing-related water damage incident',
        rule: 'Plain noun phrase. What a plumber would say face to face.',
    },
    {
        context: 'Primary CTA',
        do: 'Show Providers',
        avoid: 'View matched service providers',
        rule: 'Verb and object. Three words maximum. No filler.',
    },
    {
        context: 'Empty State — No Providers Nearby',
        do: 'No providers in your area yet. We\'re expanding, leave your details and we\'ll notify you.',
        avoid: 'There are currently no service providers available in your selected geographic area at this time.',
        rule: 'Acknowledge honestly. Explain briefly. One clear next step. No em dashes.',
    },
    {
        context: 'Error — Diagnosis Failed',
        do: 'Something went wrong. Try again, or describe the issue in words.',
        avoid: 'An error occurred while processing your request. Please try again later.',
        rule: 'Conversational. Always give an immediate alternative path. No dead ends.',
    },
    {
        context: 'AI Thought — Tone and Length',
        do: 'Brown staining with a slightly damp texture, consistent with a slow pipe leak that will likely worsen without attention.',
        avoid: 'Based on my analysis of the provided imagery, there appears to be moisture-related damage consistent with plumbing-related issues.',
        rule: 'One observation and one conclusion. Two sentences maximum. Confident, plain, first-person. No em dashes.',
    },
] as const;

// ─── Type scale ───────────────────────────────────────────────────────────────

const typeScale = [
    { label: 'Display',    className: mendrTokens.typography.classes.display, text: 'Confident Decisions Start with Clear Diagnosis' },
    { label: 'Heading 1',  className: mendrTokens.typography.classes.h1,      text: 'Mendr Diagnosis Summary' },
    { label: 'Heading 2',  className: mendrTokens.typography.classes.h2,      text: 'Trusted Local Provider Options' },
    { label: 'Heading 3',  className: mendrTokens.typography.classes.h3,      text: 'Recommended Next Step' },
    { label: 'Body Large', className: mendrTokens.typography.classes.bodyLg,  text: 'Use clear language and practical next actions to help homeowners choose confidently.' },
    { label: 'Body',       className: mendrTokens.typography.classes.body,    text: 'Use clear language and practical next actions to help homeowners choose confidently.' },
    { label: 'Label',      className: mendrTokens.typography.classes.label,   text: 'Issue Summary' },
    { label: 'Micro',      className: mendrTokens.typography.classes.micro,   text: 'Trust Signal' },
] as const;

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, children }: {
    title: string; description: string; children: React.ReactNode;
}) {
    return (
        <section className="border-b border-[#EBEBEB] py-14">
            <div className="mx-auto w-full max-w-6xl px-6">
                <div className="mb-8 space-y-1.5">
                    <h2 className={mendrTokens.typography.classes.h2}>{title}</h2>
                    <p className="text-sm text-[#6B6B6B] max-w-2xl">{description}</p>
                </div>
                {children}
            </div>
        </section>
    );
}

// ─── Domain badge helpers ─────────────────────────────────────────────────────

function UrgencyBadge({ level }: { level: UrgencyKey }) {
    const s = urgencyStyles[level];
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

function TradeBadge({ trade }: { trade: TradeKey }) {
    const s = tradeStyles[trade];
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

// ─── Domain pattern components ────────────────────────────────────────────────

function DiagnosisCard({ urgency, trade, title, detail, thought, cost, uncertain = false, revised = false }: {
    urgency: UrgencyKey; trade: TradeKey; title: string; detail: string;
    thought: string; cost: string | null; uncertain?: boolean; revised?: boolean;
}) {
    return (
        <div className={`${card} p-5`}>
            {revised && (
                <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Revised after feedback — previous diagnosis rejected
                </p>
            )}
            <p className="mb-4 text-sm italic leading-relaxed text-[#6B6B6B]">&ldquo;{thought}&rdquo;</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
                <UrgencyBadge level={urgency} />
                <TradeBadge trade={trade} />
            </div>
            <h3 className="text-base font-semibold text-[#131312]">{title}</h3>
            <p className="mt-0.5 text-sm text-[#6B6B6B]">{detail}</p>
            <div className="mt-4 flex items-center justify-between border-t border-[#EBEBEB] pt-4">
                <p className="text-sm font-medium text-[#131312]">
                    {cost ?? <span className="text-[#6B6B6B]">Estimate unavailable</span>}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm">Not Right</Button>
                    <Button size="sm">
                        {uncertain ? 'Add Photos' : 'Show Providers'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function StreamingDiagnosisCard() {
    return (
        <div className={`${card} p-5`}>
            <div className="mb-4 flex items-center gap-2">
                <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#DCF763] [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#DCF763] [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#DCF763] [animation-delay:300ms]" />
                </span>
                <p className="text-xs text-[#6B6B6B]">Analysing your images</p>
            </div>
            <p className="mb-4 text-sm italic leading-relaxed text-[#6B6B6B]">
                &ldquo;Brown staining with a slightly damp texture, consistent with a slow pipe leak&hellip;&rdquo;
                <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-[#131312] align-middle" />
            </p>
            <div className="mb-3 flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded bg-[#F2F2F0]" />
                <div className="h-5 w-20 animate-pulse rounded bg-[#F2F2F0]" />
            </div>
            <div className="mb-1 h-4 w-40 animate-pulse rounded bg-[#F2F2F0]" />
            <div className="mb-4 h-3 w-56 animate-pulse rounded bg-[#F2F2F0]" />
            <div className="mt-4 flex items-center justify-between border-t border-[#EBEBEB] pt-4">
                <div className="h-4 w-24 animate-pulse rounded bg-[#F2F2F0]" />
                <div className="flex gap-2">
                    <div className="h-8 w-16 animate-pulse rounded-md bg-[#F2F2F0]" />
                    <div className="h-8 w-28 animate-pulse rounded-md bg-[#F2F2F0]" />
                </div>
            </div>
        </div>
    );
}

function ProviderCard({ name, initials, rating, reviews, trade, distance, responseTime, badge }: {
    name: string; initials: string; rating: number; reviews: number;
    trade: string; distance: string; responseTime: string; badge: string | null;
}) {
    return (
        <div className={`${badge ? cardHighlight : card} p-4`}>
            {badge && (
                <div className="mb-3">
                    <span className="inline-flex items-center rounded bg-[#DCF763] px-2 py-0.5 text-xs font-medium text-[#131312]">
                        {badge}
                    </span>
                </div>
            )}
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#DCFCE7] text-xs font-semibold text-[#166534]">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#131312]">{name}</p>
                    <p className="text-xs text-[#6B6B6B]">{trade}</p>
                    <div className="mt-1 flex items-center gap-1">
                        <Star size={11} className="fill-[#DCF763] text-[#DCF763]" />
                        <span className="text-xs font-medium text-[#131312]">{rating}</span>
                        <span className="text-xs text-[#6B6B6B]">({reviews})</span>
                    </div>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-[#EBEBEB] pt-3 text-xs text-[#6B6B6B]">
                <MapPin size={11} />
                <span>{distance}</span>
                <span>·</span>
                <Clock size={11} />
                <span>{responseTime}</span>
            </div>
            <Button size="sm" className="mt-3 w-full">Request Callout</Button>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DesignPreviewClient() {
    return (
        <main className="min-h-screen bg-[#FAFAFA] text-[#131312]">

            {/* ── Header ── */}
            <section className="border-b border-[#EBEBEB] py-14">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{BRAND_NAME} Design System</Badge>
                        <Badge variant="outline">Noindex</Badge>
                    </div>
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-[#6B6B6B]">{BRAND_TAGLINE}</p>
                        <h1 className={mendrTokens.typography.classes.display}>Brand Direction</h1>
                        <p className="max-w-xl text-base leading-relaxed text-[#6B6B6B]">
                            The canonical reference for typography, colour, components, and copy. Use this as the source of truth when building Mendr interfaces.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── Typography ── */}
            <Section title="Typography" description="Söhne by Klim Type Foundry. Available in 8 weights. Headings use semibold, body uses regular, labels use medium.">
                <div className="space-y-3">
                    {typeScale.map((s) => (
                        <div key={s.label} className={`${cardMuted} px-5 py-4`}>
                            <p className="mb-1.5 text-xs font-medium text-[#6B6B6B]">{s.label}</p>
                            <p className={s.className}>{s.text}</p>
                        </div>
                    ))}
                    <div className={`${cardMuted} px-5 py-4`}>
                        <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Weight Scale</p>
                        <div className="flex flex-wrap gap-8">
                            {(Object.entries(mendrTokens.typography.weights) as [string, number][]).map(([name, weight]) => (
                                <div key={name} className="flex flex-col items-center gap-1">
                                    <span className="text-xl text-[#131312]" style={{ fontWeight: weight }}>Ag</span>
                                    <span className="text-xs capitalize text-[#6B6B6B]">{name}</span>
                                    <span className="text-xs text-[#B0B0A8]">{weight}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Colour System ── */}
            <Section title="Colour System" description="4-token core palette, 3 semantic states, and surface tokens for backgrounds and borders.">
                <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Core Palette</p>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                        { name: 'Ink',           hex: '#131312', role: 'Headings, body text'      },
                        { name: 'Ink Secondary', hex: '#6B6B6B', role: 'Captions, helper text'    },
                        { name: 'Canvas',        hex: '#FAFAFA', role: 'Page background', border: true },
                        { name: 'Lime',          hex: '#DCF763', role: 'Primary action'            },
                    ].map(({ name, hex, role, border }) => (
                        <div key={name} className="overflow-hidden rounded-lg border border-[#EBEBEB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            <div className={`h-16 ${border ? 'border-b border-[#EBEBEB]' : ''}`} style={{ backgroundColor: hex }} />
                            <div className="p-3">
                                <p className="text-sm font-medium text-[#131312]">{name}</p>
                                <p className="font-sans text-xs text-[#6B6B6B]">{hex}</p>
                                <p className="text-xs text-[#B0B0A8]">{role}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Surfaces</p>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                        { name: 'White',     hex: '#FFFFFF', role: 'Cards, modals',       border: true },
                        { name: 'Secondary', hex: '#F2F2F0', role: 'Muted backgrounds'               },
                        { name: 'Line',      hex: '#EBEBEB', role: 'Borders, dividers'               },
                        { name: 'Link',      hex: '#5C7A00', role: 'Link text, dark lime'            },
                    ].map(({ name, hex, role, border }) => (
                        <div key={name} className="overflow-hidden rounded-lg border border-[#EBEBEB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            <div className={`h-10 ${border ? 'border-b border-[#EBEBEB]' : ''}`} style={{ backgroundColor: hex }} />
                            <div className="p-3">
                                <p className="text-sm font-medium text-[#131312]">{name}</p>
                                <p className="font-sans text-xs text-[#6B6B6B]">{hex}</p>
                                <p className="text-xs text-[#B0B0A8]">{role}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Semantic States</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                        { name: 'Success', textHex: '#166534', bgHex: '#DCFCE7' },
                        { name: 'Warning', textHex: '#92400E', bgHex: '#FEF3C7' },
                        { name: 'Danger',  textHex: '#991B1B', bgHex: '#FEE2E2' },
                    ].map(({ name, textHex, bgHex }) => (
                        <div key={name} className="overflow-hidden rounded-lg border border-[#EBEBEB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            <div className="flex h-10">
                                <div className="w-1/2" style={{ backgroundColor: bgHex }} />
                                <div className="w-1/2" style={{ backgroundColor: textHex }} />
                            </div>
                            <div className="p-3">
                                <p className="text-sm font-medium text-[#131312]">{name}</p>
                                <p className="font-sans text-xs text-[#6B6B6B]">{bgHex} / {textHex}</p>
                                <p className="text-xs text-[#B0B0A8]">Background / Text</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Spacing ── */}
            <Section title="Spacing" description="Tailwind's 4px base unit. Standard scale used across layout and component spacing.">
                <div className="space-y-2.5">
                    {[
                        { token: 'space-1', px: 4  }, { token: 'space-2', px: 8   },
                        { token: 'space-3', px: 12  }, { token: 'space-4', px: 16  },
                        { token: 'space-5', px: 20  }, { token: 'space-6', px: 24  },
                        { token: 'space-8', px: 32  }, { token: 'space-10', px: 40 },
                        { token: 'space-12', px: 48 }, { token: 'space-16', px: 64 },
                    ].map(({ token, px }) => (
                        <div key={token} className="flex items-center gap-4">
                            <span className="w-20 shrink-0 font-sans text-xs text-[#6B6B6B]">{token}</span>
                            <div className="h-4 rounded-sm bg-[#DCF763]" style={{ width: px }} />
                            <span className="text-xs text-[#B0B0A8]">{px}px</span>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Borders and Radius ── */}
            <Section title="Borders and Radius" description="Border colours and corner radius used across the UI.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                        <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Border Colours</p>
                        <div className="space-y-2">
                            {[
                                { name: 'Default', hex: '#EBEBEB', use: 'Cards, inputs, dividers'    },
                                { name: 'Focus',   hex: '#DCF763', use: 'Input focus ring (lime)'    },
                                { name: 'Primary', hex: '#DCF763', use: 'Highlighted card'           },
                                { name: 'Danger',  hex: '#FCA5A5', use: 'Error input, destructive card' },
                            ].map(({ name, hex, use }) => (
                                <div key={name} className="flex items-center gap-3 rounded-md border border-[#EBEBEB] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                                    <div className="h-5 w-5 rounded border-2" style={{ borderColor: hex }} />
                                    <span className="flex-1 text-sm font-medium text-[#131312]">{name}</span>
                                    <span className="font-sans text-xs text-[#6B6B6B]">{hex}</span>
                                    <span className="text-xs text-[#B0B0A8]">{use}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Corner Radius</p>
                        <div className="space-y-2">
                            {[
                                { name: 'rounded',     px: '2px',    use: 'Badges, tiny chips'        },
                                { name: 'rounded-md',  px: '6px',    use: 'Buttons, inputs, controls' },
                                { name: 'rounded-lg',  px: '8px',    use: 'Cards, panels'             },
                                { name: 'rounded-xl',  px: '12px',   use: 'Large modals only'         },
                                { name: 'rounded-full','px': '9999px', use: 'Avatars, pill badges'    },
                            ].map(({ name, px, use }) => (
                                <div key={name} className="flex items-center gap-3 rounded-md border border-[#EBEBEB] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                                    <div className="h-5 w-5 border-2 border-[#131312]" style={{ borderRadius: px }} />
                                    <span className="flex-1 text-sm font-medium text-[#131312]">{name}</span>
                                    <span className="font-sans text-xs text-[#6B6B6B]">{px}</span>
                                    <span className="text-xs text-[#B0B0A8]">{use}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Icons ── */}
            <Section title="Icons" description="Lucide via lucide-react. Three stroke widths shown — pick one and apply consistently.">
                <div className="mb-8 space-y-4">
                    <p className="text-xs font-medium text-[#6B6B6B]">Stroke Width Comparison — Pick a Style</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {([
                            { label: 'Thin',    strokeWidth: 1   },
                            { label: 'Regular', strokeWidth: 1.5 },
                            { label: 'Bold',    strokeWidth: 2.5 },
                        ] as const).map(({ label, strokeWidth }) => (
                            <div key={label} className={`${cardMuted} p-4`}>
                                <p className="mb-3 text-xs font-medium text-[#131312]">{label} — strokeWidth {strokeWidth}</p>
                                <div className="flex flex-wrap gap-4">
                                    {[Home, Camera, Wrench, Zap, AlertTriangle, CheckCircle, MapPin, Star].map((Icon, i) => (
                                        <Icon key={i} size={22} strokeWidth={strokeWidth} className="text-[#131312]" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Full Icon Set</p>
                <div className={`${cardMuted} p-5`}>
                    <div className="grid grid-cols-6 gap-y-5 gap-x-3 sm:grid-cols-9 md:grid-cols-12">
                        {[
                            { icon: Home,         name: 'Home'      }, { icon: Camera,      name: 'Camera'    },
                            { icon: Upload,       name: 'Upload'    }, { icon: Image,        name: 'Image'     },
                            { icon: Search,       name: 'Search'    }, { icon: MapPin,       name: 'MapPin'    },
                            { icon: Clock,        name: 'Clock'     }, { icon: Phone,        name: 'Phone'     },
                            { icon: Bell,         name: 'Bell'      }, { icon: Star,         name: 'Star'      },
                            { icon: CheckCircle,  name: 'Check'     }, { icon: AlertTriangle, name: 'Warning'  },
                            { icon: Info,         name: 'Info'      }, { icon: BadgeCheck,   name: 'Verified'  },
                            { icon: X,            name: 'Close'     }, { icon: Plus,         name: 'Plus'      },
                            { icon: ArrowRight,   name: 'Arrow'     }, { icon: ChevronRight, name: 'Chevron'   },
                            { icon: Wrench,       name: 'Wrench'    }, { icon: Zap,          name: 'Electrical'},
                            { icon: Droplets,     name: 'Water'     }, { icon: Wind,         name: 'HVAC'      },
                            { icon: Hammer,       name: 'Hammer'    }, { icon: ShieldCheck,  name: 'Security'  },
                        ].map(({ icon: Icon, name }) => (
                            <div key={name} className="flex flex-col items-center gap-1.5">
                                <Icon size={20} className="text-[#131312]" />
                                <span className="text-xs text-center leading-tight text-[#6B6B6B]">{name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ── Buttons ── */}
            <Section title="Buttons" description="shadcn Button with Mendr variants. 5 sizes (xs → xl), all rounded-md. Focus ring is always lime.">
                <div className="grid gap-6 lg:grid-cols-2">

                    {/* Size scale per variant */}
                    <div className={`${card} p-5 space-y-6`}>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Default — Primary Action</p>
                            <div className="flex flex-wrap items-end gap-3">
                                {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((size) => (
                                    <div key={size} className="flex flex-col items-center gap-1.5">
                                        <Button size={size}>
                                            {size === 'xs' ? 'Label' : 'Start Diagnosis'}
                                        </Button>
                                        <span className="font-sans text-xs text-[#B0B0A8]">
                                            {size === 'default' ? 'md' : size}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Outline — Secondary Action</p>
                            <div className="flex flex-wrap items-end gap-3">
                                {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((size) => (
                                    <div key={size} className="flex flex-col items-center gap-1.5">
                                        <Button variant="outline" size={size}>
                                            {size === 'xs' ? 'Label' : 'Review Report'}
                                        </Button>
                                        <span className="font-sans text-xs text-[#B0B0A8]">
                                            {size === 'default' ? 'md' : size}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Ghost — Tertiary Action</p>
                            <div className="flex flex-wrap items-end gap-3">
                                {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((size) => (
                                    <div key={size} className="flex flex-col items-center gap-1.5">
                                        <Button variant="ghost" size={size}>
                                            {size === 'xs' ? 'Label' : 'View Details'}
                                        </Button>
                                        <span className="font-sans text-xs text-[#B0B0A8]">
                                            {size === 'default' ? 'md' : size}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Variants, icons, icon-only */}
                    <div className={`${card} p-5 space-y-6`}>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">All Variants</p>
                            <div className="flex flex-wrap gap-2">
                                <Button>Default</Button>
                                <Button variant="outline">Outline</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="destructive">Destructive</Button>
                                <Button variant="link">Link</Button>
                                <Button disabled>Disabled</Button>
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">With Icons</p>
                            <div className="flex flex-wrap gap-2">
                                <Button>
                                    <Camera size={14} /> Upload Photo
                                </Button>
                                <Button variant="outline">
                                    <MapPin size={14} /> Change Location
                                </Button>
                                <Button variant="outline">
                                    Show Providers <ArrowRight size={14} />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Icon Only</p>
                            <div className="flex gap-2">
                                {([Plus, X, ArrowRight, Search] as const).map((Icon, i) => (
                                    <Button key={i} variant="outline" size="icon">
                                        <Icon size={15} />
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Form Controls ── */}
            <Section title="Form Controls" description="shadcn Input and Textarea with lime focus ring. text-[16px] md:text-[14px] prevents iOS auto-zoom. Form groups use gap-3 throughout.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={`${card} p-5 space-y-6`}>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Input Sizes</p>
                            <div className="flex flex-col gap-3">
                                {([
                                    { size: 'sm', label: 'Small',   h: 'h-8'  },
                                    { size: 'md', label: 'Medium',  h: 'h-9'  },
                                    { size: 'lg', label: 'Large',   h: 'h-10' },
                                ]).map(({ size, label, h }) => (
                                    <div key={size} className="flex items-center gap-3">
                                        <span className="w-12 shrink-0 font-sans text-xs text-[#B0B0A8]">{size} / {label}</span>
                                        <Input className={`${inputClass} ${h}`} placeholder="Ceiling pipe leak in the kitchen" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Input States</p>
                            <div className="flex flex-col gap-3">
                                <Input className={inputClass} placeholder="Default" />
                                <Input className={`${inputClass} border-[#DCF763] ring-2 ring-[#DCF763]`} placeholder="Focused (ring visible)" />
                                <Input className={`${inputClass} border-red-300 focus-visible:ring-red-400`} placeholder="Error state" />
                                <Input className={`${inputClass} opacity-50 cursor-not-allowed`} placeholder="Disabled" disabled />
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Input with Icon Prefix</p>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
                                <Input className={`${inputClass} pl-9`} placeholder="Search providers" />
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Textarea</p>
                            <Textarea className={textareaClass} placeholder="Started after heavy rain. No visible burst pipe but the ceiling feels damp." />
                        </div>
                    </div>
                    <div className={`${card} p-5 space-y-6`}>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Select</p>
                            <Select>
                                <SelectTrigger className={`${inputClass} h-9`}>
                                    <SelectValue placeholder="Select a Trade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="plumbing">Plumbing</SelectItem>
                                    <SelectItem value="electrical">Electrical</SelectItem>
                                    <SelectItem value="roofing">Roofing</SelectItem>
                                    <SelectItem value="damp">Damp Specialist</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Label Patterns (gap-3)</p>
                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="ex-required">Issue Summary <span className="text-red-500">*</span></Label>
                                    <Input id="ex-required" className={inputClass} placeholder="Ceiling pipe leak" />
                                </div>
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="ex-helper">Postcode</Label>
                                    <Input id="ex-helper" className={inputClass} placeholder="8001" />
                                    <p className="text-xs text-[#6B6B6B]">Used to find providers near you.</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="ex-error" className="text-red-600">Email Address</Label>
                                    <Input id="ex-error" className={`${inputClass} border-red-300 focus-visible:ring-red-400`} placeholder="me@example.com" />
                                    <p className="text-xs text-red-600">Enter a valid email address.</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="ex-textarea">Additional Context</Label>
                                    <Textarea id="ex-textarea" className={textareaClass} placeholder="Describe when it started and what you've noticed." />
                                    <p className="text-xs text-[#6B6B6B]">Keep details factual and measurable.</p>
                                </div>
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Checkbox</p>
                            <div className="flex flex-col gap-3">
                                {['Notify me when providers are available', 'Send a copy to my email', 'Accept terms and conditions'].map((label) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <Checkbox id={label} />
                                        <Label htmlFor={label} className="text-sm font-normal">{label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Switch</p>
                            <div className="flex flex-col gap-3">
                                {['Email Notifications', 'SMS Updates', 'Location Access'].map((label) => (
                                    <div key={label} className="flex items-center justify-between">
                                        <Label className="text-sm font-normal">{label}</Label>
                                        <Switch />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Slider — Search Radius</p>
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between text-xs text-[#6B6B6B]">
                                    <span>Radius</span><span>25 km</span>
                                </div>
                                <Slider defaultValue={[25]} max={100} step={5} />
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Cards ── */}
            <Section title="Card Designs" description="Four card styles. Default for most content. Elevated only where depth is meaningful.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        { label: 'Default',     cls: card,          desc: 'Border, subtle shadow. The default for most content.' },
                        { label: 'Muted',       cls: cardMuted,     desc: 'Canvas background. For code blocks or reference content.' },
                        { label: 'Highlighted', cls: cardHighlight, desc: 'Lime border. For featured or top-match items only.' },
                        { label: 'Elevated',    cls: cardElevated,  desc: 'Stronger shadow. Use sparingly where depth is meaningful.' },
                    ].map(({ label, cls, desc }) => (
                        <div key={label}>
                            <p className="mb-2 text-xs font-medium text-[#6B6B6B]">{label}</p>
                            <div className={`${cls} p-4`}>
                                {label === 'Highlighted' && (
                                    <span className="mb-2 inline-block rounded bg-[#DCF763] px-2 py-0.5 text-xs font-medium text-[#131312]">Top Match</span>
                                )}
                                <p className="text-sm font-semibold text-[#131312]">Card Title</p>
                                <p className="mt-1 text-sm text-[#6B6B6B]">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Badges ── */}
            <Section title="Badges" description="Status and categorical badges. Urgency and trade badges are used together on diagnosis cards.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={`${card} p-5 space-y-4`}>
                        <p className="text-xs font-medium text-[#6B6B6B]">shadcn Badge Variants</p>
                        <div className="flex flex-wrap gap-2">
                            <Badge className="bg-[#DCF763] text-[#131312] hover:bg-[#CCEA50]">Primary</Badge>
                            <Badge variant="secondary">Secondary</Badge>
                            <Badge variant="outline">Outline</Badge>
                            <Badge className="bg-[#DCFCE7] text-[#166534] hover:bg-[#DCFCE7]">Available</Badge>
                            <Badge className="bg-[#FEF3C7] text-[#92400E] hover:bg-[#FEF3C7]">Act Soon</Badge>
                            <Badge className="bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FEE2E2]">Urgent</Badge>
                        </div>
                        <Separator />
                        <p className="text-xs font-medium text-[#6B6B6B]">Diagnosis Urgency</p>
                        <div className="flex flex-col gap-3">
                            {(Object.entries(urgencyStyles) as [UrgencyKey, typeof urgencyStyles[UrgencyKey]][]).map(([key, s]) => (
                                <div key={key} className="flex items-start gap-3 rounded-md border border-[#EBEBEB] p-3">
                                    <span className="mt-0.5 shrink-0 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                                        style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                                    <p className="text-sm text-[#6B6B6B]">
                                        {key === 'monitor'    && 'Low risk. Safe to observe, no immediate action needed.'}
                                        {key === 'act-soon'   && 'Deteriorating. Will worsen if left unaddressed. Book within 1 to 2 weeks.'}
                                        {key === 'urgent'     && 'Safety or structural risk. Book immediately.'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={`${card} p-5 space-y-4`}>
                        <p className="text-xs font-medium text-[#6B6B6B]">Trade Badges</p>
                        <div className="flex flex-wrap gap-2">
                            {(Object.entries(tradeStyles) as [TradeKey, typeof tradeStyles[TradeKey]][]).map(([key, s]) => (
                                <span key={key} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                                    style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                            ))}
                        </div>
                        <p className="text-xs text-[#6B6B6B]">Distinct colour per trade so a homeowner can identify category at a glance, without reading the label. New trades need a catalogue entry before use.</p>
                        <Separator />
                        <p className="text-xs font-medium text-[#6B6B6B]">Badge on Diagnosis Card</p>
                        <div className="flex gap-1.5">
                            <UrgencyBadge level="urgent" />
                            <TradeBadge trade="plumbing" />
                        </div>
                        <p className="text-xs text-[#6B6B6B]">Always one urgency badge and one trade badge. No other combinations.</p>
                    </div>
                </div>
            </Section>

            {/* ── Feedback ── */}
            <Section title="Feedback Components" description="Progress, alerts, avatars, and tooltips.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={`${card} p-5 space-y-5`}>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Progress</p>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between text-xs text-[#6B6B6B]">
                                        <span>Upload</span><span>72%</span>
                                    </div>
                                    <Progress value={72} className="h-1.5" />
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between text-xs text-[#6B6B6B]">
                                        <span>Step 2 of 4</span><span>50%</span>
                                    </div>
                                    <Progress value={50} className="h-1.5" />
                                </div>
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Avatars</p>
                            <div className="flex items-center gap-3">
                                {['CP', 'WP', 'MR', 'AK'].map((initials) => (
                                    <Avatar key={initials} className="h-9 w-9">
                                        <AvatarFallback className="rounded-md bg-[#DCFCE7] text-xs font-semibold text-[#166534]">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">Tooltip</p>
                            <TooltipProvider>
                                <div className="flex gap-3">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Info size={13} /> Rating
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="text-xs">Based on verified reviews only.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Info size={13} /> Distance
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="text-xs">Straight-line distance from your location.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </TooltipProvider>
                        </div>
                    </div>
                    <div className={`${card} p-5 space-y-3`}>
                        <p className="text-xs font-medium text-[#6B6B6B]">Alert Variants</p>
                        <Alert className="rounded-md">
                            <Info size={14} />
                            <AlertTitle>Diagnosis Ready</AlertTitle>
                            <AlertDescription>Your report is available. Review and confirm to see providers.</AlertDescription>
                        </Alert>
                        <div className="rounded-md border border-[#DCFCE7] bg-[#DCFCE7] p-4">
                            <div className="flex items-start gap-2.5">
                                <CheckCircle size={14} className="mt-0.5 shrink-0 text-[#166534]" />
                                <div>
                                    <p className="text-sm font-semibold text-[#166534]">Request Sent</p>
                                    <p className="text-xs text-[#166634]/80">Waterwise Plumbers will be in touch within 2 hours.</p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-md border border-[#FEF3C7] bg-[#FEF3C7] p-4">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#92400E]" />
                                <div>
                                    <p className="text-sm font-semibold text-[#92400E]">Act Soon</p>
                                    <p className="text-xs text-[#92400E]/80">This issue will worsen if left unattended.</p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-md border border-[#FEE2E2] bg-[#FEE2E2] p-4">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#991B1B]" />
                                <div>
                                    <p className="text-sm font-semibold text-[#991B1B]">Urgent Attention Needed</p>
                                    <p className="text-xs text-[#991B1B]/80">This may pose a safety risk. Book a provider today.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Interaction Components ── */}
            <Section title="Interaction Components" description="Dialog, sheet, dropdown, tabs, and accordion. Keep shadcn internals for these — they handle ARIA correctly.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={`${card} p-5 space-y-5`}>
                        <p className="text-xs font-medium text-[#6B6B6B]">Dialog, Sheet, and Dropdown</p>
                        <div className="flex flex-wrap gap-2">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">Open Dialog</Button>
                                </DialogTrigger>
                                <DialogContent className="rounded-lg p-6">
                                    <DialogHeader>
                                        <DialogTitle>Send This Request</DialogTitle>
                                        <DialogDescription>Your diagnosis and contact details will be sent to the selected provider.</DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter className="mt-4 gap-2">
                                        <Button variant="outline" size="sm">Cancel</Button>
                                        <Button size="sm">Send Now</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="sm">Open Sheet</Button>
                                </SheetTrigger>
                                <SheetContent className="p-6 sm:max-w-md">
                                    <SheetHeader>
                                        <SheetTitle>Filter Providers</SheetTitle>
                                        <SheetDescription>Narrow results by distance, rating, and trade.</SheetDescription>
                                    </SheetHeader>
                                    <div className="flex flex-col gap-5 py-6">
                                        <div className="flex flex-col gap-3">
                                            <Label>Max Distance</Label>
                                            <Input className={inputClass} placeholder="25 km" />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label>Minimum Rating</Label>
                                            <Slider defaultValue={[40]} max={50} step={1} />
                                        </div>
                                    </div>
                                    <SheetFooter className="gap-2">
                                        <Button variant="outline" size="sm">Reset</Button>
                                        <Button size="sm">Apply</Button>
                                    </SheetFooter>
                                </SheetContent>
                            </Sheet>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">More Actions</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>Copy Diagnosis Link</DropdownMenuItem>
                                    <DropdownMenuItem>Share Report</DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <p className="text-xs font-medium text-[#6B6B6B]">Tabs</p>
                        <Tabs defaultValue="diagnosis">
                            <TabsList className="w-full">
                                <TabsTrigger value="diagnosis" className="flex-1">Diagnosis</TabsTrigger>
                                <TabsTrigger value="providers" className="flex-1">Providers</TabsTrigger>
                                <TabsTrigger value="history"   className="flex-1">History</TabsTrigger>
                            </TabsList>
                            <TabsContent value="diagnosis" className="mt-3 rounded-md border border-[#EBEBEB] p-3 text-sm text-[#6B6B6B]">Diagnosis content panel</TabsContent>
                            <TabsContent value="providers" className="mt-3 rounded-md border border-[#EBEBEB] p-3 text-sm text-[#6B6B6B]">Provider listing panel</TabsContent>
                            <TabsContent value="history"   className="mt-3 rounded-md border border-[#EBEBEB] p-3 text-sm text-[#6B6B6B]">Past diagnoses panel</TabsContent>
                        </Tabs>
                    </div>
                    <div className={`${card} p-5`}>
                        <p className="mb-4 text-xs font-medium text-[#6B6B6B]">Accordion</p>
                        <Accordion type="single" collapsible>
                            <AccordionItem value="a">
                                <AccordionTrigger className="text-sm">How the Diagnosis Works</AccordionTrigger>
                                <AccordionContent className="text-sm text-[#6B6B6B]">Upload a photo and Mendr's AI analyses it to identify the likely issue and recommend a trade.</AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="b">
                                <AccordionTrigger className="text-sm">How Providers Are Selected</AccordionTrigger>
                                <AccordionContent className="text-sm text-[#6B6B6B]">Providers are matched by trade, location, and rating. The top match is shown first.</AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="c">
                                <AccordionTrigger className="text-sm">Accuracy of the Diagnosis</AccordionTrigger>
                                <AccordionContent className="text-sm text-[#6B6B6B]">Accuracy improves with clear, well-lit photos. You can confirm or reject the result before seeing providers.</AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </div>
            </Section>

            {/* ── Diagnosis Card States ── */}
            <Section title="Diagnosis Card — All States"
                description="The primary AI output pattern. Thought block always renders first. Badge colours, CTA label, and cost visibility change by state.">
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Streaming — AI Thinking</p>
                        <StreamingDiagnosisCard />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Confident Result</p>
                        <DiagnosisCard urgency="urgent" trade="plumbing" title="Ceiling Pipe Leak"
                            detail="Pipe joint failure, slow water ingress"
                            thought="Brown staining with a slightly damp texture, consistent with a slow pipe leak that will likely worsen without attention."
                            cost="R1,200 to R2,800" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Uncertain — Needs More Information</p>
                        <DiagnosisCard urgency="monitor" trade="plumbing" title="Possible Damp or Leak"
                            detail="Source unclear from images provided"
                            thought="I can see discolouration but cannot confirm whether this is active ingress or old damage. A closer photo would help narrow it down."
                            cost={null} uncertain />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Revised — Previous Diagnosis Rejected</p>
                        <DiagnosisCard urgency="act-soon" trade="electrical" title="Electrical Heat Mark"
                            detail="Revised, previous plumbing diagnosis rejected"
                            thought="Looking again with the correction in mind, the pattern and proximity to a fitting suggests heat rather than water ingress."
                            cost="R800 to R1,600" revised />
                    </div>
                </div>
            </Section>

            {/* ── Provider Card States ── */}
            <Section title="Provider Card — All States"
                description="Contractor listing pattern. Rating and distance are the primary trust signals. Top match uses lime border.">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Standard</p>
                        <ProviderCard name="Cape Plumbing Co." initials="CP" rating={4.8}
                            reviews={142} trade="Plumbing" distance="3.2 km"
                            responseTime="Replies within 2 hrs" badge={null} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Top Match</p>
                        <ProviderCard name="Waterwise Plumbers" initials="WP" rating={4.9}
                            reviews={318} trade="Plumbing" distance="1.8 km"
                            responseTime="Responds within 30 min" badge="Top Match" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[#6B6B6B]">Skeleton — Loading</p>
                        <div className={`${card} p-4`}>
                            <div className="flex items-start gap-3">
                                <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-[#F2F2F0]" />
                                <div className="flex-1 space-y-2 pt-0.5">
                                    <div className="h-3 w-32 animate-pulse rounded bg-[#F2F2F0]" />
                                    <div className="h-2.5 w-20 animate-pulse rounded bg-[#F2F2F0]" />
                                    <div className="h-2.5 w-24 animate-pulse rounded bg-[#F2F2F0]" />
                                </div>
                            </div>
                            <div className="mt-3 flex gap-3 border-t border-[#EBEBEB] pt-3">
                                <div className="h-2.5 w-12 animate-pulse rounded bg-[#F2F2F0]" />
                                <div className="h-2.5 w-28 animate-pulse rounded bg-[#F2F2F0]" />
                            </div>
                            <div className="mt-3 h-8 w-full animate-pulse rounded-md bg-[#F2F2F0]" />
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Empty and Error States ── */}
            <Section title="Empty and Error States"
                description="Icon, heading, one-line explanation, one action. No dead ends — always give a clear path forward.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className={`${card} flex flex-col items-center py-10 text-center px-5`}>
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#F2F2F0]">
                            <MapPin size={17} className="text-[#6B6B6B]" />
                        </div>
                        <p className="mb-1 text-sm font-semibold text-[#131312]">No Providers Nearby Yet</p>
                        <p className="mb-4 text-xs text-[#6B6B6B]">We're expanding to your area. Leave your details and we'll notify you.</p>
                        <Button size="sm">Notify Me</Button>
                    </div>
                    <div className={`${card} flex flex-col items-center py-10 text-center px-5`}>
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#FEE2E2]">
                            <AlertTriangle size={17} className="text-[#991B1B]" />
                        </div>
                        <p className="mb-1 text-sm font-semibold text-[#131312]">Diagnosis Failed</p>
                        <p className="mb-4 text-xs text-[#6B6B6B]">Something went wrong. Try again, or describe the issue in words.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm">Describe Instead</Button>
                            <Button size="sm">Try Again</Button>
                        </div>
                    </div>
                    <div className={`${card} flex flex-col items-center py-10 text-center px-5`}>
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#F2F2F0]">
                            <Clock size={17} className="text-[#6B6B6B]" />
                        </div>
                        <p className="mb-1 text-sm font-semibold text-[#131312]">No History Yet</p>
                        <p className="mb-4 text-xs text-[#6B6B6B]">Your past diagnoses will appear here after your first one.</p>
                        <Button size="sm">Start Diagnosis</Button>
                    </div>
                </div>
            </Section>

            {/* ── Microcopy ── */}
            <Section title="Microcopy in Context"
                description="Every surface has a do and an avoid. The rule explains the principle so it applies consistently to new surfaces.">
                <div className="space-y-3">
                    {copyExamples.map((ex) => (
                        <div key={ex.context} className={`${cardMuted} p-5`}>
                            <p className="mb-3 text-xs font-medium text-[#6B6B6B]">{ex.context}</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-md bg-[#DCFCE7] p-3">
                                    <p className="mb-1 text-xs font-semibold text-[#166634]">Do</p>
                                    <p className="text-sm text-[#131312]">&ldquo;{ex.do}&rdquo;</p>
                                </div>
                                <div className="rounded-md bg-[#FEE2E2] p-3">
                                    <p className="mb-1 text-xs font-semibold text-[#991B1B]">Avoid</p>
                                    <p className="text-sm text-[#131312]">&ldquo;{ex.avoid}&rdquo;</p>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-[#6B6B6B]">{ex.rule}</p>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Copywriting Rules ── */}
            <Section title="Copywriting Rules"
                description="Voice and copy build trust as much as visual design. Friendly neighbour who gets to the point.">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={`${card} p-5`}>
                        <p className="mb-4 text-sm font-semibold text-[#131312]">Voice</p>
                        <div className="flex flex-col gap-3">
                            {mendrCopyGuidelines.voice.map((item) => (
                                <p key={item} className="rounded-md bg-[#F2F2F0] px-3 py-2 text-sm text-[#131312]">{item}</p>
                            ))}
                            <p className="rounded-md bg-[#F2F2F0] px-3 py-2 text-sm text-[#131312]">No em dashes. Use commas, colons, or full stops instead.</p>
                            <p className="rounded-md bg-[#F2F2F0] px-3 py-2 text-sm text-[#131312]">No question marks in UI copy. Rephrase as imperatives or statements.</p>
                            <p className="rounded-md bg-[#F2F2F0] px-3 py-2 text-sm text-[#131312]">British English throughout: colour, analyse, organisation, recognise.</p>
                            <p className="rounded-md bg-[#F2F2F0] px-3 py-2 text-sm text-[#131312]">No ampersands in copy. Write "and" in full.</p>
                        </div>
                        <p className="mt-4 text-sm text-[#6B6B6B]">
                            <span className="font-medium text-[#131312]">Headline formula: </span>
                            {mendrCopyGuidelines.headlineFormula}
                        </p>
                    </div>
                    <div className={`${card} p-5`}>
                        <p className="mb-4 text-sm font-semibold text-[#131312]">CTA Rules</p>
                        <div className="flex flex-col gap-3 mb-5">
                            {mendrCopyGuidelines.ctaRules.map((rule) => (
                                <p key={rule} className="rounded-md bg-[#DCFCE7] px-3 py-2 text-sm text-[#166634]">{rule}</p>
                            ))}
                        </div>
                        <p className="mb-3 text-sm font-semibold text-[#131312]">Banned Phrases</p>
                        <div className="flex flex-col gap-3">
                            {mendrCopyGuidelines.bannedPhrases.map((phrase) => (
                                <p key={phrase} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Avoid: {phrase}</p>
                            ))}
                        </div>
                    </div>
                </div>
            </Section>

            <section className="py-12">
                <div className="mx-auto w-full max-w-6xl px-6">
                    <Alert className="rounded-md">
                        <CheckCircle size={14} />
                        <AlertTitle>Design System Ready for Implementation</AlertTitle>
                        <AlertDescription>
                            Apply these patterns across all product surfaces. Any new component should reference this page before being built.
                        </AlertDescription>
                    </Alert>
                </div>
            </section>

        </main>
    );
}
