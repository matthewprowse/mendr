# Menda — Frontend Design System

**Scope:** All user-facing routes except `/admin/**`.  
**Stack:** Next.js 16 App Router · Tailwind CSS v4 · shadcn/ui · Söhne + Signifier · Lucide icons · Framer Motion (marketing only).

This document is the single source of truth for visual design, interaction patterns, copywriting voice, and dark mode. It is authoritative for new features, rewrites, and design reviews. Update it whenever a decision changes — do not let the code drift ahead of this file.

> **How to use this document**  
> When building something new, read §3 (Voice) first, then §4 (Colour), §5 (Typography), and §10 (Component Patterns). The backlog in §17 tracks known gaps. Add a changelog entry (§18) whenever you make a meaningful design decision.

---

## Table of Contents

1. [Brand Identity](#1-brand-identity)
2. [Design Principles](#2-design-principles)
3. [Copywriting Voice](#3-copywriting-voice)
4. [Colour System](#4-colour-system)
5. [Typography](#5-typography)
6. [Spacing](#6-spacing)
7. [Border Radius](#7-border-radius)
8. [Shadows and Elevation](#8-shadows-and-elevation)
9. [Iconography](#9-iconography)
10. [Component Patterns](#10-component-patterns)
11. [Motion and Animation](#11-motion-and-animation)
12. [App Flows](#12-app-flows)
13. [Marketing Pages](#13-marketing-pages)
14. [Dark Mode](#14-dark-mode)
15. [Responsive Design](#15-responsive-design)
16. [Accessibility](#16-accessibility)
17. [Backlog](#17-backlog)
18. [Changelog](#18-changelog)

---

## 1. Brand Identity

### 1.1 What Menda is

Menda is an AI-powered home fault diagnosis product for Western Cape homeowners. A user photographs a problem at home — a leaking geyser, a tripped breaker, a broken gate motor — and Menda gives them a clear, honest diagnosis and connects them with vetted local contractors who can fix it.

The product sits at an intersection that few services occupy: it is genuinely useful (AI-powered, local, fast) and genuinely warm (it speaks like a knowledgeable neighbour, not a corporate chatbot or a technical manual).

### 1.2 Personality

Menda's personality sits at the intersection of three reference points:

- **The knowledgeable neighbour** — Someone who has seen the problem before, gives you a straight answer, and doesn't talk down to you. Friendly, not fussy. Direct, not cold.
- **Apple's product communication** — Every word earns its place. Short sentences. Active voice. No jargon unless the user brought it up first. Trust the user to understand.
- **Claude's reasoning style** — Logical, structured, honest about uncertainty. Never confidently wrong. Acknowledges complexity without drowning the reader in it.

The brand is warm without being gushing. It is helpful without being obsequious. It is technical enough to be credible and simple enough to be approachable.

### 1.3 Brand name

- **Public name:** Menda  
- **Legacy name:** Scandio (migration in progress — see `src/lib/brand-system.ts`)
- **Rule:** All visible strings, CTAs, share copy, OG metadata, and JSON-LD must use `BRAND_NAME` from `brand-system.ts`. Never hardcode "Scandio" in new code.

---

## 2. Design Principles

These principles apply to every surface — marketing, app, mobile, and desktop. When two principles conflict, use judgement and record the decision in §18.

### 2.1 Clarity over cleverness

The user is often stressed — a pipe is leaking, the power is out. The interface must communicate the essential thing at a glance. Use plain language. Use familiar patterns. Prefer the obvious interaction over the elegant one.

### 2.2 Earn every pixel

No decorative complexity that doesn't serve meaning. Blank space is not wasted space — it is breathing room that makes the important things pop. Placeholders are never acceptable in production.

### 2.3 Consistent, predictable, trustworthy

The same action always looks and behaves the same way across routes. A primary button on `/start` is identical to a primary button on `/match`. Inconsistency signals carelessness; carelessness undermines trust.

### 2.4 Branding through restraint

Lime is the accent — use it deliberately, not liberally. The primary action on a screen gets lime. Supporting elements get neutral tones. Marketing can push harder; product UI pulls back.

### 2.5 Designed for mobile first, tested on desktop

The majority of users come from mobile (photographing a fault). Design the smallest viewport first and expand upward. Desktop layouts should feel generous and spacious, not merely zoomed-in mobile layouts.

### 2.6 Respect the user's preferences

Dark mode, reduced motion, and large text are not afterthoughts. Build them in from the start. A user who has set their OS to dark mode should see a coherent dark experience, not an inverted accident.

---

## 3. Copywriting Voice

### 3.1 The core voice

**Friendly neighbour who also happens to know a lot.**

Write as if you are someone the homeowner already trusts — a friend who has been through the same problem, knows what it costs to fix, and will tell you straight. Not a call centre script. Not a startup trying to sound cool. Not a legal disclaimer dressed up in friendly clothing.

The closest analogues: Apple's product copy and Claude's interface text. Both are warm but never fluffy. Both are precise but never clinical.

### 3.2 Voice rules

**Short sentences.** If a sentence needs a comma or a conjunction to survive, consider splitting it.

**Active voice.** "We couldn't find your location" not "Your location could not be found."

**No hype.** Never use "amazing", "incredible", "powerful", or "revolutionary." Describe what the product does. Let the user decide how impressive it is.

**Honest about limits.** If Menda is uncertain, say so. "This looks like a geyser issue — but we'd recommend a plumber confirms before you buy parts." Trust wins more than false confidence.

**No filler phrases.** Cut "simply", "just", "easily", "seamlessly". If something is simple, it will feel simple. Saying so adds nothing.

**Address the user directly.** "Your report is ready" not "The report has been generated." "We found 4 contractors near you" not "4 contractors have been matched."

**Use "we" for Menda, "you" for the user.** Avoid "the system", "the platform", "the app".

### 3.3 Copy patterns by context

**Headlines (marketing)**  
Short, concrete benefit. Verb-forward. No full stop needed.  
✓ "Know what's wrong before you call anyone"  
✓ "Get a diagnosis in under 2 minutes"  
✗ "Revolutionising home maintenance for Western Cape homeowners"

**CTA buttons**  
Verb + outcome. Never just "Submit" or "Continue" when a specific label is possible.  
✓ "Get my diagnosis"  
✓ "Find contractors near me"  
✓ "See full report"  
✗ "Proceed"  
✗ "Click here"

**Empty states**  
Acknowledge the state, orient the user, offer a next step.  
✓ "No contractors found for this area yet. We're growing our network — try a broader search or check back soon."  
✗ "No results."

**Error messages**  
What happened + what to do. Never blame the user.  
✓ "We couldn't process your image. Try a clearer photo with good lighting."  
✗ "Invalid file format."  
✓ "Something went wrong on our end. Your diagnosis has been saved — reload to try again."  
✗ "500 Internal Server Error."

**Loading states**  
Tell the user what's happening. Use present progressive tense.  
✓ "Analysing your image…"  
✓ "Finding contractors in your area…"  
✗ "Loading…"  
✗ "Please wait…"

**Success states**  
Confirm + orient. Keep it brief.  
✓ "Diagnosis complete. Here's what we found."  
✓ "Report saved. You can share it or come back later."

**Tooltips and helper text**  
One short sentence. If it needs more than one sentence, the UI needs clarification, not a tooltip essay.

### 3.4 Tone by surface

| Surface | Tone | Example |
|---------|------|---------|
| Marketing home (`/`) | Confident, welcoming, benefit-first | "Know what's wrong before you call anyone." |
| Diagnosis upload (`/start`) | Encouraging, practical | "Take a clear photo — the more we can see, the more accurate your diagnosis." |
| Processing (`/processing`) | Calm, reassuring | "Analysing your images. This usually takes about 30 seconds." |
| Diagnosis report (`/report`) | Clear, informative | "Based on what we can see, this looks like…" |
| Match results (`/match`) | Helpful, low-pressure | "Here are contractors who can help. Tap a card to see their profile." |
| Error states | Honest, actionable | "We couldn't load your results. Check your connection and try again." |
| Auth | Brief, trustworthy | "Continue with your email — no password required." |
| Contractor-facing | Professional, peer-level | "Your profile is live. New leads will appear here." |

### 3.5 Things Menda never says

- "We're sorry for the inconvenience" (use "Sorry this happened" or just fix it)
- "Please don't hesitate to…"
- "We value your privacy" as a standalone sentence (show it, don't say it)
- "Powered by AI" (it's implied; if it needs saying, say what the AI actually does)
- Exclamation marks in error states or serious flows

---

## 4. Colour System

### 4.1 Brand palette (light mode)

These are the named Menda colours. They map directly to CSS variables in `globals.css` and the TypeScript object in `src/lib/design-tokens.ts`.

| Token | Hex | Usage |
|-------|-----|-------|
| `--menda-ink` | `#131312` | Primary text, high-emphasis UI. Warm near-black (not pure). |
| `--menda-ink-secondary` | `#6B6B6B` | Secondary text, captions, metadata, placeholder labels |
| `--menda-canvas` | `#FAFAFA` | Page background — warm off-white, not pure white |
| `--menda-surface` | `#FFFFFF` | Cards, sheets, elevated surfaces — clean white |
| `--menda-line` | `#EBEBEB` | Dividers, borders, separators |
| `--menda-primary` | `#DCF763` | **Lime** — primary action colour, focus rings, active states |
| `--menda-primary-foreground` | `#131312` | Text/icons on lime backgrounds |
| `--menda-link` | `#5C7A00` | Inline text links — dark green, accessible on white |

### 4.2 Semantic tokens (shadcn mapping)

These are the tokens consumed by shadcn/ui components and Tailwind utilities. They are wired to the Menda palette in `:root`.

| CSS variable | Light value | Role |
|---|---|---|
| `--background` | `#FAFAFA` | `bg-background` — page canvas |
| `--foreground` | `#131312` | `text-foreground` — primary text |
| `--card` | `#FFFFFF` | `bg-card` — card surfaces |
| `--card-foreground` | `#131312` | `text-card-foreground` |
| `--primary` | `#DCF763` | `bg-primary` — primary actions |
| `--primary-foreground` | `#131312` | `text-primary-foreground` |
| `--primary-hover` | `#CCEA50` | Slightly darker lime for hover states |
| `--secondary` | `#F2F2F0` | `bg-secondary` — ghost/secondary surfaces |
| `--secondary-foreground` | `#131312` | |
| `--muted` | `#F2F2F0` | `bg-muted` — disabled, skeleton backgrounds |
| `--muted-foreground` | `#6B6B6B` | `text-muted-foreground` — secondary labels |
| `--border` | `#EBEBEB` | `border-border` — all default borders |
| `--input` | `#EBEBEB` | Input borders |
| `--ring` | `#DCF763` | Focus rings |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error/danger states |

### 4.3 Status colours

Used for feedback states only — not as brand decoration.

| State | Background token | Foreground | Usage |
|-------|-----------------|------------|-------|
| Success | `#DCFCE7` | `#166534` | Job done, confirmed, saved |
| Warning | `#FEF3C7` | `#92400E` | Degraded, uncertain, attention needed |
| Danger | `#FEE2E2` | `#991B1B` | Error, failed, destructive action |

### 4.4 Usage rules

**One primary action per screen gets lime.** The main CTA. Not the secondary button, not the nav item, not the chip.

**Never use lime as a background for large surface areas** (sections, cards, full-screen). It is an accent — a highlight on an otherwise calm surface.

**Never hardcode hex in components.** Always use the CSS variable (`var(--primary)`) or the Tailwind semantic class (`bg-primary`). This makes dark mode and theme changes free.

**The orange (`#E8601A`) in `FlowStepHeader` is a legacy value** that predates the current token system. It is not a documented secondary accent. New components must not use it. Existing use should be migrated to `--primary` or a new `--secondary-accent` token when that decision is made.

---

## 5. Typography

### 5.1 Typefaces

**Söhne (product UI)**  
Used everywhere except marketing-only serif moments. `font-sans` on `body`. A clean, rationalist neo-grotesk with excellent legibility at small sizes. Available weights: 300 (Leicht), 400 (Buch), 500 (Kraftig), 600 (Halbfett), 700 (Dreiviertelfett), 900 (Extrafett).

**Signifier (marketing serif)**  
Used selectively on `/` and `/landing1` for editorial headlines. Variable font (wght axis 100–900, roman and italic). Not used in product UI until a specific product decision is made. `font-serif` in Tailwind.

**No monospace in the brand system.** Do not use `font-mono` or any monospace webfont. Technical strings (IDs, codes) use `font-sans` with `tabular-nums` when column alignment is needed.

### 5.2 Type ramp

These are the canonical classes from `mendaTokens.typography.classes`. Always use these utilities — never arbitrary `text-[Npx]` values.

| Role | Tailwind class | Notes |
|------|----------------|-------|
| Display | `text-4xl font-semibold` | Marketing hero headlines only |
| H1 | `text-2xl font-semibold` | Page-level heading, one per route |
| H2 | `text-xl font-semibold` | Major section heading |
| H3 | `text-base font-semibold` | Card heading, minor section |
| Body large | `text-base leading-7` | Introductory paragraph, onboarding |
| Body | `text-sm` | Default content text |
| Label | `text-sm font-medium` | Form labels, UI labels |
| Micro | `text-xs font-medium` | Chips, badges, metadata, captions |

### 5.3 Weight usage

- `font-medium` (500) — active states, labels, UI-critical text
- `font-semibold` (600) — headings, strong emphasis
- `font-bold` (700) — reserved for high-emphasis callouts (use sparingly)
- `font-normal` (400) — body text, descriptions, everything else

Do not use `font-light` (300) in product UI — it degrades legibility on small screens and OLED panels in dark mode.

### 5.4 Mobile input caveat

`Input` and `Textarea` fields use `text-base md:text-sm`. This is intentional: iOS auto-zooms on inputs below 16px font size. `text-base` (16px) prevents the zoom; `md:text-sm` restores the compact size on desktop. Do not change this pattern.

### 5.5 Line lengths

Body text should not exceed ~70 characters per line (approximately `max-w-prose` or `max-w-2xl`). Long lines reduce readability, especially on desktop where containers are wide.

---

## 6. Spacing

### 6.1 Base scale

The spacing system is rooted in **4px** (Tailwind's default: 1 unit = 0.25rem = 4px at 16px root). Every spacing value should be a multiple of 4px.

| Scale value | px | Tailwind token | Use |
|---|---|---|---|
| `0.5` | 2px | `p-0.5`, `gap-0.5` | Hairline gaps, optical corrections only |
| `1` | 4px | `p-1`, `gap-1` | Icon/text tight gap, dense UI |
| `2` | 8px | `p-2`, `gap-2` | Default tight stack, chip padding |
| `3` | 12px | `p-3`, `gap-3` | Compact card padding, form helper gap |
| `4` | 16px | `p-4`, `gap-4` | Standard inset, card padding baseline |
| `5` | 20px | `p-5`, `gap-5` | Slightly generous card inset |
| `6` | 24px | `p-6`, `gap-6` | Section breathing room, larger cards |
| `8` | 32px | `p-8`, `gap-8` | Page-level inset on desktop |
| `9` | 36px | `p-9`, `gap-9` | Between-section rhythm |
| `10` | 40px | `p-10` | Large section spacing |
| `12` | 48px | `p-12` | Marketing section inset |
| `14` | 56px | `py-14` | Section vertical (mobile) |
| `20` | 80px | `py-20` | Section vertical (desktop) |

### 6.2 Named spacing tokens

From `mendaTokens.spacing`:

| Token | Class | Use |
|-------|-------|-----|
| `section` | `py-14 md:py-20` | Standard vertical padding for major sections |
| `stack` | `space-y-6` | Default vertical stack between elements |
| `stackTight` | `space-y-3` | Tight vertical stack (form fields, list items) |

### 6.3 Container rhythm

```
max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
```

This is the **only** marketing container recipe. Do not invent alternatives. For narrow app surfaces (forms, auth, single-column flows) use `max-w-md` or `max-w-lg` with `mx-auto`.

### 6.4 What to avoid

- Arbitrary spacing (`px-[17px]`, `mt-[11px]`) — use the nearest scale value
- Skipping from `gap-6` to `gap-9` when `gap-8` would serve — use the full ladder
- Using `margin` where `gap` in a flex/grid context would be more predictable

---

## 7. Border Radius

From `mendaTokens.radius` and the Tailwind `@theme` radius scale (base `--radius: 0.375rem`):

| Token | Class | Use |
|-------|-------|-----|
| `control` | `rounded-md` | Buttons, inputs, select, chips — interactive controls |
| `card` | `rounded-lg` | Cards, panels, sheets, modals — container surfaces |
| `pill` | `rounded-full` | Avatar thumbnails, status dots, toggle tracks |
| `sm` | `rounded-sm` | Tight UI elements, tooltip corners |
| `xl` | `rounded-xl` | Large marketing cards, hero image frames |
| `2xl` | `rounded-2xl` | Large marketing surfaces (use sparingly) |

**Do not mix radius values within a component.** A card's inner button uses `rounded-md` (control), not `rounded-lg` (card). The border radius communicates "what kind of thing am I?"

---

## 8. Shadows and Elevation

### 8.1 Light mode

| Token | Value | Use |
|-------|-------|-----|
| `shadow-card` | `shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)]` | Default card lift — subtle, barely there |
| `shadow-sm` | Tailwind default | Dropdowns, popovers |
| `shadow-md` | Tailwind default | Modals, elevated panels |
| `shadow-lg` | Tailwind default | Bottom sheet overlays |

### 8.2 Dark mode

Elevation in dark mode is communicated through **surface lightness, not shadows**. Darker backgrounds feel recessed; lighter surfaces float. Do not increase shadow opacity in dark mode — use surface tokens instead (see §14).

### 8.3 Rules

- Only one level of shadow per composition — do not stack `shadow-md` on a card that already lives in a `shadow-lg` sheet.
- Marketing hero elements may use stronger shadows for dramatic effect. Product UI should stay subtle.

---

## 9. Iconography

### 9.1 Standard: Lucide

`components.json` sets `"iconLibrary": "lucide"`. **All new work uses Lucide.** Migrate Phosphor icons on existing surfaces when touching those components.

Do not mix Lucide and Phosphor on the same page. Mixed families create inconsistent stroke weights and corner language next to the same text.

### 9.2 Size and stroke

| Icon size | Tailwind | Paired with |
|-----------|----------|------------|
| `size-3` (12px) | `size-3` | Avoid — too small for most contexts |
| `size-4` (16px) | `size-4` | `text-sm` body text, chips, labels |
| `size-5` (20px) | `size-5` | `text-base` body text, card headers |
| `size-6` (24px) | `size-6` | Navigation, standalone icons |
| `size-8` (32px) | `size-8` | Feature icons, empty state illustrations |

**Default stroke:** Use Lucide's default (`strokeWidth={1.5}` unless overridden). This matches Söhne's mid-weight stems and avoids icons looking heavier than the surrounding text.

Do not use `size-3` next to `text-lg` headings, or `size-6` next to `text-xs` labels. Icon size should track text size.

### 9.3 Semantic use

- Decorative icons (supporting text) — use `aria-hidden="true"`
- Standalone interactive icons (icon-only buttons) — include a visually hidden label or `aria-label`
- Status icons (success, warning, error) — pair with text; do not rely on colour + icon alone for meaning

---

## 10. Component Patterns

### 10.1 App shell / top bar

Three header variants exist in the codebase today. **Do not create a fourth.** The target is a single composable `AppShell` / `TopBar` with variants:

| Variant | Current implementation | Height | Use |
|---------|----------------------|--------|-----|
| `marketing` | `LandingHeader` | ~64px | Sticky, wordmark, mobile full-screen drawer |
| `flowSticky` | `FlowTopBar` | ~56px | Sticky, back control, optional trailing action |
| `flowFixed` | `FlowStepHeader` | ~56px | Fixed, progress dots, optional step label |

**Shared rules across all variants:**
- Z-index: `z-[110]` (see §10.8 for full z-index scale)
- Back button: `size-10` (44px) tap target, secondary variant
- Safe area: `pt-[env(safe-area-inset-top)]` on fixed/sticky headers
- All visible brand strings come from `BRAND_NAME`

### 10.2 Buttons

Follow the shadcn `Button` component. Do not create parallel button systems.

| Variant | Use | Notes |
|---------|-----|-------|
| `default` (primary) | Main CTA — one per screen | `bg-primary text-primary-foreground`. Lime background, dark text. |
| `secondary` | Secondary action | `bg-secondary text-secondary-foreground`. Neutral grey. |
| `outline` | Tertiary action | `border-border` with transparent background. |
| `ghost` | Low-emphasis action | No background, no border. Nav items, icon buttons. |
| `destructive` | Irreversible actions | Red. Confirm dialogs only — never as an alternative to a warning. |

**Heights:** `h-9` default · `h-8` for `sm` · `h-10` for `lg`. Do not use arbitrary heights.  
**Radius:** `rounded-md` on all variants.  
**Loading state:** Spinner inside the button, label changes to present progressive ("Analysing…"), disabled state applied.

### 10.3 Form controls

All form controls follow shadcn primitives. Token rules:

- Border: `border-input` (`#EBEBEB` light, see §14 for dark)
- Focus: `focus-visible:ring-2 focus-visible:ring-ring`
- Error state: `border-destructive` with a `text-destructive text-sm` helper below
- Disabled: `opacity-50 cursor-not-allowed`
- Height: `h-9` for `Input` and `Select`; auto height for `Textarea`
- Text: `text-base md:text-sm` (see §5.4)
- Radius: `rounded-md`

Form labels use `text-sm font-medium` (`mendaTokens.typography.classes.label`). Helper text and errors use `text-sm` with appropriate colour.

### 10.4 Cards

```
bg-card text-card-foreground rounded-lg border border-border
shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)]
```

Card padding: `p-4` (compact) or `p-6` (default). Use `p-4` for dense lists; `p-6` for feature cards with breathing room.

Cards should not have more than two levels of nesting (card within a card within a card is a smell — consider a flat list or a sheet instead).

### 10.5 Provider cards

`ProviderCard` in `match/components/` is a reference implementation. It demonstrates:
- Carousel image with aspect ratio
- Skill/specialisation chips
- Clear CTA separation
- Loading skeleton that mirrors the final layout

When building similar content cards for other domains, use `ProviderCard` as the baseline.

### 10.6 Chips and badges

| Type | Class | Use |
|------|-------|-----|
| Neutral chip | `bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium` | Tags, categories, filters |
| Success badge | `bg-[#DCFCE7] text-[#166534]` | Verified, active, complete |
| Warning badge | `bg-[#FEF3C7] text-[#92400E]` | Pending, needs attention |
| Danger badge | `bg-[#FEE2E2] text-[#991B1B]` | Error, failed, inactive |
| Primary chip | `bg-primary/20 text-primary-foreground` | Selected filter, active state |

In dark mode, status badge backgrounds invert (see §14.3).

### 10.7 Empty states

Every route and section that can return zero results must have an empty state. Structure:

1. **Icon** — `size-8`, `text-muted-foreground`
2. **Headline** — `text-base font-semibold` — what is absent
3. **Body** — `text-sm text-muted-foreground` — why, and what to do
4. **CTA** (optional) — primary or secondary button

Follow the copywriting rules in §3.3: acknowledge, orient, offer a next step.

### 10.8 Z-index scale

| Layer | Value | Elements |
|-------|-------|---------|
| Base | `z-0` | Default document flow |
| Raised | `z-10` | Sticky table headers, floating action buttons |
| Header | `z-[110]` | All top bar variants |
| Overlay | `z-[200]` | Chat message overlays, sticky chat input |
| Modal | `z-[300]` | Sheets, dialogs, drawers |
| Toast | `z-[400]` | Notification toasts |

Do not use arbitrary z-values outside this scale.

### 10.9 Loading skeletons

Loading states should mirror the final layout — same height, same column structure, same card dimensions. Use `bg-muted animate-pulse rounded-md` for skeleton shapes.

A centred spinner is acceptable for full-page route transitions. For content regions that load independently (provider list, map), use layout-mirroring skeletons.

### 10.10 Modals and sheets

- Mobile: use **bottom sheet** (`Sheet` from shadcn, `side="bottom"`) with `rounded-t-xl` top corners
- Desktop: use **dialog** (`Dialog` from shadcn) centred with `max-w-lg`
- Both: include a visible close action (×), a title, and proper focus trap
- Sheets and dialogs use `z-[300]`

---

## 11. Motion and Animation

### 11.1 Where motion is used

| Surface | Tool | Notes |
|---------|------|-------|
| Marketing pages (`/`, `/landing1`) | Framer Motion | Scroll reveals, hero parallax, stagger animations |
| Product UI (diagnosis, match, auth) | CSS transitions only | `transition-*` utilities, no Framer Motion import |
| Loading skeletons | CSS animation | `animate-pulse` (Tailwind) |
| Sheet/modal enter/exit | shadcn built-in | `tw-animate-css` transitions already in `globals.css` |

**Do not add Framer Motion imports to hot-path routes** (`/processing`, `/diagnosis`, `/report`). The bundle cost is not justified for product UI where CSS transitions are sufficient.

### 11.2 Reduced motion

All Framer Motion animations must respect `prefers-reduced-motion`:

```tsx
import { useReducedMotion } from 'framer-motion';

const shouldReduceMotion = useReducedMotion();
// disable or minimise animations when true
```

CSS transitions in product UI:

```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; }
}
```

### 11.3 Duration defaults

| Type | Duration | Notes |
|------|----------|-------|
| Micro (button press, chip select) | 100–150ms | Feel instant |
| Transition (panel, drawer) | 200–300ms | Smooth but not slow |
| Page reveal (scroll, stagger) | 400–600ms | Marketing only |
| Skeleton → content | 0ms | No transition — cut immediately to reduce jank |

---

## 12. App Flows

### 12.1 Primary homeowner journey

```
/start → /processing/[id] → /diagnosis/[id] → /report/[id] → /match
```

Each step must feel visually continuous: the same header variant, the same background colour, the same type scale. A user should feel like they are in the same product across all five steps.

### 12.2 `/start` — Problem description

- Single-task screen: describe the problem, optionally attach photos
- `FlowTopBar` or `FlowStepHeader` (resolve to single pattern)
- Photo attachment must show clear affordance for adding/removing images
- Submit button: "Diagnose my problem" (not "Submit")
- If the user leaves without submitting: persist draft state

### 12.3 `/processing/[id]` — AI thinking

- Calm, reassuring tone (§3.3)
- Show meaningful progress: "Analysing your image…" → "Identifying the fault…" → "Almost done"
- Do not show a blank spinner with no message
- If processing takes longer than expected: "Still thinking — this can take up to a minute for complex faults"
- No heavy animations here — pure CSS

### 12.4 `/diagnosis/[id]` — Diagnosis input form

- `FlowStepHeader` currently — migrate to unified shell
- Progressive disclosure: show the most important fields first
- Long forms on desktop benefit from sticky sub-navigation or section anchors
- Inline validation only on blur (not on keystroke)
- Loading skeletons that mirror the final form layout

### 12.5 `/report/[id]` — Diagnosis report

- This is the product's "hero moment" — the result the user came for
- The diagnosis headline should be prominent: `text-2xl font-semibold`
- Confidence should be communicated visually (not just a number)
- Share action: parameterised from `BRAND_NAME` — never hardcoded "Scandio"
- CTA to `/match`: "Find contractors who can fix this"

### 12.6 `/match` — Contractor matching

- Map + list layout: map takes priority on mobile (full screen, toggle to list)
- `ProviderCard` with skeleton loading that mirrors the card dimensions
- Filter sheet accessible from a persistent bottom control
- Verified badge copy: "Verified on Menda" (not Scandio)
- Load more: pagination, not infinite scroll, to keep the page predictable

### 12.7 Auth (`/auth`)

- Minimal — one task per screen
- Magic link flow: email input → confirmation screen → (email) → logged in
- Google button follows brand colour, not Google's blue
- Social proof is optional but appropriate: "Trusted by Cape Town homeowners"
- Never store more than the necessary session in the UI

---

## 13. Marketing Pages

### 13.1 Marketing vs product design

Marketing pages (`/`, `/landing1`, `/contractors`) may use:
- Signifier serif for headlines
- Framer Motion for scroll reveals and hero animation
- Larger type scales (`text-5xl`, `text-6xl`) for hero moments
- Bold layout experiments (inverted sections, bento grids, full-bleed imagery)

Product pages (diagnosis, match, auth) must not use Signifier, Framer Motion, or large marketing type scales.

### 13.2 Home (`/`)

- Single canonical entry point for homeowners
- Hero: real product screenshot or device frame mockup — never a grey placeholder
- Bento grid: use real UI crops or photography — never placeholder boxes
- Stats: only display numbers that are real and current
- FAQ: use `Accordion` component for mobile readability
- CTA: "Get my diagnosis" → `/start`
- OG image and JSON-LD: must use `BRAND_NAME`

### 13.3 `/landing1` vs `/`

Resolve the dual-home strategy before launch:
- **Option A:** Merge the best sections of `/landing1` into `/` and retire `/landing1`
- **Option B:** Keep `/landing1` as a campaign landing page (`noindex`) and make `/` the canonical home

Until resolved: all internal CTAs point to `/` only.

### 13.4 Contractors (`/contractors`)

- Marketing + directory + profile pages coexist
- Header: same `LandingHeader` as homeowner marketing — this is a dual-audience product
- Terminology: "Contractors" facing outward; "Providers" in internal database/API naming
- Pricing table: must work at 320px width — stacked cards or horizontal scroll with scroll hint

### 13.5 Legal, about, contact

- Footer copyright: `© {year} {BRAND_NAME}` — no hardcoded brand name
- About: written in Menda voice (§3), not corporate "About Us" boilerplate
- Contact: if a contact form exists, it works; if `/contact` is retired, it redirects cleanly

---

## 14. Dark Mode

### 14.1 Philosophy

The dark mode is not an inverted version of the light mode — it is a re-expression of the same brand in a low-light environment. The Menda identity (lime primary, warm dark tones, clean geometry) works in both modes without compromise.

Key principles:
- **Warm darks, not pure black.** The brand's ink colour `#131312` has warmth. Dark backgrounds continue that warmth — slightly brownish-grey, not cold blue-black.
- **Elevation through lightness.** Cards and modals float above the background not through shadows but through a slightly lighter surface value.
- **Lime survives.** `#DCF763` is equally vibrant on dark as on light. Keep it as primary. Adjust only if accessibility checks fail (aim for ≥3:1 on interactive, ≥4.5:1 on text).
- **Muted contrast.** Secondary text in dark mode should feel softer than in light mode — less competing with the primary content.

### 14.2 Dark mode tokens

Add a `.dark` class block in `globals.css` with these values. The `.dark` class is toggled by the theme system on `<html>`.

```css
.dark {
    /* Page canvas — warm near-black */
    --background: #111110;
    --foreground: #F4F4F0;

    /* Card / surface — slightly lighter than canvas, creates elevation */
    --card: #1A1A18;
    --card-foreground: #F4F4F0;

    /* Popover / overlay surfaces */
    --popover: #1F1F1D;
    --popover-foreground: #F4F4F0;

    /* Primary — lime survives dark mode unchanged */
    --primary: #DCF763;
    --primary-foreground: #131312;
    --primary-hover: #CCEA50;

    /* Secondary / ghost surfaces */
    --secondary: #252523;
    --secondary-foreground: #F4F4F0;

    /* Muted — skeleton backgrounds, disabled states */
    --muted: #252523;
    --muted-foreground: #8A8A84;

    /* Accent */
    --accent: #252523;
    --accent-foreground: #F4F4F0;

    /* Destructive — softened red for dark context */
    --destructive: oklch(0.5 0.2 27);

    /* Borders and inputs — subtle, warm grey */
    --border: #2A2A27;
    --input: #2A2A27;

    /* Focus ring — lime, same as light */
    --ring: #DCF763;

    /* Sidebar */
    --sidebar: #161614;
    --sidebar-foreground: #F4F4F0;
    --sidebar-primary: #DCF763;
    --sidebar-primary-foreground: #131312;
    --sidebar-accent: #252523;
    --sidebar-accent-foreground: #F4F4F0;
    --sidebar-border: #2A2A27;
    --sidebar-ring: #DCF763;

    /* Menda brand tokens (dark equivalents) */
    --menda-ink: #F4F4F0;
    --menda-ink-secondary: #8A8A84;
    --menda-canvas: #111110;
    --menda-surface: #1A1A18;
    --menda-line: #2A2A27;
}
```

### 14.3 Status colours in dark mode

Status badge backgrounds need dark-mode variants — the light-mode pastels disappear against dark surfaces.

| State | Dark background | Dark foreground |
|-------|----------------|-----------------|
| Success | `#0F2A1A` | `#4ADE80` |
| Warning | `#2A1F07` | `#FCD34D` |
| Danger | `#2A0E0E` | `#F87171` |

Implement as CSS variable overrides within `.dark` or as conditional Tailwind classes (`dark:bg-[#0F2A1A]`).

### 14.4 Shadows in dark mode

In dark mode, drop shadows become nearly invisible on dark surfaces. This is correct behaviour — elevation is expressed through surface lightness, not shadows. Do not increase shadow opacity to compensate.

The `shadow-card` token can be removed or replaced with a `border border-border` in dark mode, since the border (`#2A2A27`) provides sufficient edge definition.

### 14.5 Typography in dark mode

- Use `text-foreground` (not `text-black` or `text-[#131312]`) — it resolves to the dark foreground automatically
- Avoid `text-muted-foreground` for anything that needs to pass contrast checks — it is intentionally softer (`#8A8A84`) and may not meet WCAG AA for body text
- `font-light` (300) is especially bad in dark mode on OLED — avoid entirely

### 14.6 Images and photography in dark mode

- Hero images and photography should work in both modes without adjustment
- UI crop screenshots may need dark-mode variants if they show light UI chrome
- Illustrated icons and bento graphics in the Menda lime/ink palette work in both modes

### 14.7 Theme toggle

Implement theme toggle using the `class` strategy on `<html>`:
- `localStorage` stores the preference: `'light'` | `'dark'` | `'system'`
- Default: `'system'` (respect OS preference via `prefers-color-scheme`)
- The toggle component lives in the marketing header and settings (if applicable)
- SSR: read the preference server-side to avoid flash of wrong theme (inject `<script>` in `<head>` before paint)

---

## 15. Responsive Design

### 15.1 Breakpoint contract

| Breakpoint | px | When it triggers |
|---|---|---|
| (default) | 0+ | Mobile — single column, minimal chrome |
| `sm:` | 640px | Minor layout adjustments, larger tap targets |
| `md:` | 768px | Navigation drawer becomes persistent, two-column layouts begin |
| `lg:` | 1024px | Full desktop layout — map + list side by side, wider containers |
| `xl:` | 1280px | Max-width containers only — do not introduce new layout columns here |

**Rules:**
- Never use `xl:` for layout column switches — that belongs at `lg:` or below
- Use `md:` for navigation breakpoints (hamburger → persistent nav)
- Use `lg:` for multi-column content layouts
- Test at 320px width (smallest iPhone SE) for every new page

### 15.2 Touch targets

Minimum 44×44px for all interactive elements on mobile (`h-11 w-11` in Tailwind). Controls that are smaller than this must be wrapped in a larger invisible hit area.

`FlowStepHeader` progress dots and close buttons already meet this. Verify map controls and any custom chip/tag interactions.

### 15.3 Safe area insets

Any element that is `fixed` or `sticky` and sits near the top or bottom edge must respect device notches and home indicators:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

Implemented on: `LandingHeader` (mobile sheet bottom), `FlowStepHeader` (top). Must be added to any new fixed bottom bars (persistent CTAs, filter sheets).

### 15.4 Tables and comparison grids

At `sm:` and below, long tables should switch to:
- **Stacked cards** — each row becomes a card with label+value pairs
- **Horizontal scroll** — with a visible scroll hint (`overflow-x-auto` + gradient edge fade)

The contractors pricing table and `/landing1` comparison grids must not rely on `lg:`-only breakpoints for readability.

### 15.5 Typography scale across breakpoints

Body text does not change size across breakpoints. Only headlines scale:

```
text-3xl md:text-4xl lg:text-5xl  ← marketing hero only
text-2xl md:text-3xl              ← marketing H1 only
text-2xl                          ← product H1 (fixed)
```

Do not scale body text up on desktop — it creates inconsistency and makes the desktop feel like a zoomed mobile view.

---

## 16. Accessibility

### 16.1 Targets

- **WCAG 2.1 AA** for all user-facing surfaces
- Minimum contrast: 4.5:1 for text; 3:1 for non-text (borders, icons on backgrounds)
- The primary lime (`#DCF763`) on `#131312` background: passes at high contrast (verify exact ratio with tool)
- Secondary text `#6B6B6B` on `#FAFAFA`: verify — this is a known borderline case

### 16.2 Focus management

- All interactive elements use `focus-visible:ring-2 focus-visible:ring-ring` (lime ring)
- Focus ring is never suppressed globally — only hide it for pointer events using `:focus-visible` (not `:focus`)
- Modals and sheets: trap focus on open, return focus to trigger on close
- Mobile nav drawer: same focus trap requirement

### 16.3 Screen reader support

- All icon-only buttons include `aria-label`
- Decorative icons use `aria-hidden="true"`
- Loading states announce progress: `aria-live="polite"` on status regions
- Magic-link confirmation screen: `aria-live="assertive"` for the confirmation message
- Diagnosis processing steps: `aria-live="polite"` for step transitions

### 16.4 Heading hierarchy

Every route has exactly one `<h1>`. The heading order must be logical (h1 → h2 → h3, no skipping). Long client-side pages (diagnosis, chat) are especially prone to heading hierarchy regressions — audit on every significant rewrite.

### 16.5 Colour-only communication

Never use colour as the only means of communicating state. Status indicators always pair an icon or text with colour. Error states always include an error message, not just a red border.

### 16.6 Form accessibility

- Every input has an associated `<label>` (via `htmlFor`/`id` or `aria-labelledby`)
- Error messages use `aria-describedby` to associate with their input
- Required fields marked with `aria-required="true"` (not just a visual asterisk)

---

## 17. Backlog

Prioritised improvement items. Each item references the relevant section of this document.

### P0 — Ship-blockers

1. **Fill all hero/bento placeholders** (§13.2) — Replace `<Placeholder>` components with real screenshots, device frames, or photography on `/` and contractor marketing blocks
2. **Unified brand strings** — Replace all remaining "Scandio" hardcodes with `BRAND_NAME` from `brand-system.ts` (§1.3)
3. **Implement dark mode tokens** (§14.2) — Add `.dark` block to `globals.css`

### P1 — Cohesion

4. **Single app shell component** (§10.1) — Merge `LandingHeader`, `FlowStepHeader`, `FlowTopBar` into one composable `TopBar` with variants
5. **Resolve dual-home strategy** (§13.3) — Choose between `/` and `/landing1` as canonical; set the other to `noindex` or retire it
6. **Migrate orange hex in FlowStepHeader** (§4.4) — Replace `#E8601A` with `--primary` or a new documented `--secondary-accent` token
7. **Lucide-only** (§9.1) — Remove Phosphor icon imports from all surfaces, migrate to Lucide equivalents
8. **Dark mode status badges** (§14.3) — Add `.dark` overrides for success/warning/danger badges

### P2 — Polish and scale

9. **Reduce motion guard** (§11.2) — Audit all Framer Motion blocks for `useReducedMotion()` hook
10. **Mobile table patterns** (§15.4) — Replace `lg:`-only table breakpoints with stacked cards at `sm:`
11. **Breakpoint contract enforcement** (§15.1) — Remove `xl:` layout column switches; consolidate to `lg:`
12. **WCAG contrast audit** (§16.1) — Verify `#6B6B6B` on `#FAFAFA` for secondary text; check lime on dark background
13. **Heading hierarchy audit** (§16.4) — Walk every route with a screen reader or audit tool; fix order regressions
14. **Empty states** (§10.7) — Audit every list/data surface for missing empty state components
15. **Landing1 arbitrary px cleanup** (§5.2) — Migrate `text-[Npx]` to nearest Tailwind step in `/landing1`

### Adding new items

When you discover a new gap, add it here with:
- A one-line description
- The priority (P0/P1/P2)
- A reference to the relevant section of this document

---

## 18. Changelog

When you make a meaningful design decision, add an entry here. Include: what changed, why, and what the previous state was.

| Date | Change | Reason |
|------|--------|--------|
| May 2026 | Established initial design system document from audit | Consolidate decisions into single authoritative reference |
| May 2026 | Added dark mode token specification (§14) | No dark mode existed; derived from light mode brand values |
| May 2026 | Defined copywriting voice guidelines (§3) | Voice was implicit; needed to be explicit for consistency |
| May 2026 | Declared Lucide as single icon standard (§9) | Phosphor + Lucide mix creating inconsistent stroke language |
| May 2026 | Standardised z-index scale (§10.8) | Stacking conflicts between chat overlays and header |

---

*Owner: Matthew Prowse. Last updated: May 2026.*  
*To propose changes: update this document and add a changelog entry. Do not implement a pattern that is not documented here without documenting it first.*
