/**
 * Mendr Design Tokens
 * ─────────────────────
 * Single source of truth for every shared colour, typography class, layout
 * class, and interactive pattern across the app.
 *
 * Import from here — never inline these values directly in component files.
 *
 * Usage:
 *   import { PAGE_BG, INK, typography, card, layout, interactive } from '@/lib/ui';
 *   <div style={{ background: PAGE_BG }} className={layout.page}>…</div>
 */

// ── Brand colours ──────────────────────────────────────────────────────────────

/** Off-white page background, consistent across all flow screens. */
export const PAGE_BG = '#FBFAF7';

/** Primary ink colour for headings and high-emphasis text. */
export const INK = '#16120E';

// ── Typography ─────────────────────────────────────────────────────────────────

export const typography = {
    /** Hero / page-title: 24px semibold. e.g. "Your Mendr Report" */
    pageTitle: 'text-2xl font-semibold leading-snug',

    /** Section heading inside a step or page: 20px semibold. */
    stepTitle: 'text-xl font-semibold leading-snug',

    /** Card / result title: 18px semibold. */
    cardTitle: 'text-lg font-semibold leading-tight',

    /** Very large centred input label on the start/add-info screens: 22px medium. */
    displayInput: 'text-[22px] font-medium text-center leading-relaxed',

    /** Medium-emphasis label: 15px semibold, used inside step rows. */
    rowLabel: 'text-[15px] font-semibold leading-snug',

    /** Section label pill above a group of cards. */
    sectionLabel: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',

    /** Standard body copy. */
    body: 'text-sm leading-relaxed text-foreground',

    /** De-emphasised body / captions. */
    muted: 'text-sm leading-relaxed text-muted-foreground',

    /** Tiny hint / disclaimer text. */
    hint: 'text-xs text-muted-foreground',

    /** Badge / metadata label inside cards. */
    meta: 'text-xs font-medium text-muted-foreground',
} as const;

// ── Layout ─────────────────────────────────────────────────────────────────────

export const layout = {
    /** Full-screen non-scrollable page container. */
    page: 'h-dvh overflow-hidden overscroll-none flex flex-col',

    /** In-flow page header — sits naturally in the flex column, never fixed. */
    header: 'shrink-0 flex items-center justify-between px-6 pt-6 pb-2',

    /** Inner scrollable region beneath the header. */
    scrollContainer: 'min-h-0 flex-1 overflow-y-auto',

    /** Content wrapper inside the scroll container. */
    contentWrapper: 'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8',

    /** Step content area — vertically centred, no scroll. */
    centredContent: 'flex-1 flex flex-col items-center justify-center px-6 min-h-0',

    /** Pinned footer for CTAs. */
    footer: 'shrink-0 px-6 pb-8 pt-4',

    /** Fixed footer with blur, used on the diagnosis page. */
    footerFixed: 'shrink-0 border-t border-border/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur',
} as const;

// ── Cards ──────────────────────────────────────────────────────────────────────

export const card = {
    /** Standard white card with large radius. */
    base: 'rounded-3xl border border-black/[0.07] bg-white shadow-sm',

    /** Dashed-border card for upload targets. */
    dashed: 'rounded-3xl bg-white/90 border-2 border-dashed border-black/10',

    /** Inner inset / muted area inside a card (e.g. skeleton placeholder). */
    inner: 'rounded-2xl bg-black/[0.03]',

    /** Subtle divider between sections within flat layout. */
    divider: 'h-px bg-black/[0.06]',
} as const;

// ── Interactive ────────────────────────────────────────────────────────────────

export const interactive = {
    /** Round icon button used in headers (back, share, close). */
    iconButton: 'flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] active:bg-black/10',

    /** Invisible placeholder matching icon button size, for header symmetry. */
    iconButtonSpacer: 'h-10 w-10',

    /** Full-width primary CTA button. */
    primaryButton: 'w-full h-10',

    /** Step progress dot — active (wide pill). */
    dotActive: 'h-1.5 w-5 rounded-full bg-foreground transition-all duration-300',

    /** Step progress dot — inactive (small circle). */
    dotInactive: 'h-1.5 w-1.5 rounded-full bg-foreground/20 transition-all duration-300',
} as const;

// ── Icons ──────────────────────────────────────────────────────────────────────
// Icons come from lucide-react (primary) and geist-icons (via @/components/icons re-exports).
// Standard sizes: 18 (header), 20 (list), 24 (feature), 28 (hero).

export const iconSize = {
    xs: 14,   // inline metadata (address, duration)
    sm: 18,   // header buttons
    md: 20,   // list rows
    lg: 24,   // feature / voice button
    xl: 28,   // hero / upload card
} as const;
