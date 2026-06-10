/**
 * Email design tokens.
 *
 * The product UI uses shadcn's neutral palette defined in OKLCH in
 * `src/app/globals.css`. Email clients cannot use OKLCH, CSS variables, or
 * Tailwind classes, so the same palette is mirrored here as email-safe hex.
 * Keep these values in sync with globals.css `:root`.
 *
 * Typography is Anthropic Sans Text — the product font — self-hosted from
 * `/public/fonts` and injected via `@font-face` in every email `<Head>`.
 * Apple Mail / iOS Mail render it; clients that strip `<style>` (Gmail,
 * Outlook) fall back to the system stack. No terracotta / brand accent: the
 * email surface matches the live neutral app exactly.
 */

import { getSiteUrl } from '@/lib/site-url';

// ── Colour tokens (neutral shadcn, OKLCH → hex) ───────────────────────────────

export const EMAIL_COLORS = {
    /** Page background — `--background` (oklch 1 0 0). The app is full-bleed white. */
    canvas: '#FFFFFF',
    /** Card / inset surface — `--card` (oklch 1 0 0). */
    card: '#FFFFFF',
    /** Hairline borders — `--border` (oklch 0.922 0 0), neutral-200. */
    border: '#E5E5E5',
    /** Headings — `--foreground` (oklch 0.145 0 0), neutral-950. */
    foreground: '#0A0A0A',
    /** Body copy — neutral-700, softer than pure foreground for long text. */
    body: '#404040',
    /** Secondary / footer text — `--muted-foreground` (oklch 0.556 0 0). */
    muted: '#737373',
    /** Primary CTA background — `--primary` (oklch 0.205 0 0), neutral-900. */
    primary: '#171717',
    /** Primary CTA text — `--primary-foreground` (oklch 0.985 0 0). */
    primaryForeground: '#FAFAFA',
    /** Inset / info-card fill — `--muted` / `--secondary` (oklch 0.97 0 0). */
    subtle: '#F5F5F5',
} as const;

// ── Radii (rem → px; `--radius` is 0.625rem) ──────────────────────────────────

export const EMAIL_RADIUS = {
    /** Inset card — matches the shadcn `<Card>` (`rounded-xl`, `--radius` + 4px). */
    card: 14,
    /** List-row / `--radius-lg` (0.625rem). */
    lg: 10,
    /** Button — `--radius-md` (calc(radius - 2px)). */
    button: 8,
    /** Badge / pill — `--radius-sm`-ish. */
    badge: 6,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

/**
 * Product font stack. Anthropic Sans Text first (rendered where webfonts are
 * honoured), then a system fallback that matches `--font-sans` in globals.css.
 */
export const EMAIL_FONT_STACK =
    "'Anthropic Sans Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Weights shipped in `/public/fonts` — keep in sync with globals.css `@font-face`. */
const FONT_FACES: ReadonlyArray<{ file: string; weight: number }> = [
    { file: 'AnthropicSans-Text-Light.otf', weight: 300 },
    { file: 'AnthropicSans-Text-Regular.otf', weight: 400 },
    { file: 'AnthropicSans-Text-Medium.otf', weight: 500 },
    { file: 'AnthropicSans-Text-Semibold.otf', weight: 600 },
    { file: 'AnthropicSans-Text-Bold.otf', weight: 700 },
    { file: 'AnthropicSans-Text-Extrabold.otf', weight: 800 },
];

// ── Asset origin + font-face CSS ──────────────────────────────────────────────

/**
 * Absolute origin that serves `/fonts/*.otf` for emails. Emails are opened off
 * our infra, so font URLs must be absolute. Precedence mirrors the old auth
 * dispatcher: explicit override → public app URL → Vercel URL → site default.
 */
export function getEmailAssetOrigin(): string {
    const origin =
        process.env.AUTH_EMAIL_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        getSiteUrl();
    return origin.replace(/\/+$/, '');
}

/**
 * `@font-face` block for Anthropic Sans Text, pointing at absolute font URLs on
 * `origin`. Inject inside an email `<Head>` via a `<style>` tag. Clients that
 * keep `<style>` (Apple Mail, iOS) render the real font; others fall back.
 */
export function anthropicSansFontFaceCss(origin: string): string {
    const base = origin.replace(/\/+$/, '');
    return FONT_FACES.map(
        ({ file, weight }) => `@font-face {
  font-family: 'Anthropic Sans Text';
  src: url('${base}/fonts/${file}') format('opentype');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`,
    ).join('\n');
}
