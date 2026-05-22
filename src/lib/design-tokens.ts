export const mendrTokens = {
    colors: {
        ink: '#131312',
        inkSecondary: '#6B6B6B',
        canvas: '#FAFAFA',
        surface: '#FFFFFF',
        line: '#EBEBEB',
        primary: '#DCF763',
        primaryForeground: '#131312',
        link: '#5C7A00',
        success: '#166534',
        successSoft: '#DCFCE7',
        warning: '#92400E',
        warningSoft: '#FEF3C7',
        danger: '#991B1B',
        dangerSoft: '#FEE2E2',
    },
    typography: {
        /** UI and app flows — Söhne via `font-sans` (`Soehne*.otf`, weights 300–900). */
        fontFamily: 'Sohne',
        /**
         * Signifier — reserved for **marketing surfaces only** (e.g. `/`, `/landing1`) until product sign-off.
         * Product UI (diagnosis, match, forms) stays `font-sans` only.
         */
        fontFamilySerif: 'Signifier',
        weights: {
            light: 300,
            regular: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        } as const,
        /** Canonical type ramp — Tailwind utilities only (no arbitrary `text-[13px]`). */
        classes: {
            display: 'text-4xl font-semibold',
            h1: 'text-2xl font-semibold',
            h2: 'text-xl font-semibold',
            h3: 'text-base font-semibold',
            bodyLg: 'text-base leading-7',
            body: 'text-sm',
            label: 'text-sm font-medium',
            micro: 'text-xs font-medium',
        },
    },
    spacing: {
        section: 'py-14 md:py-20',
        stack: 'space-y-6',
        stackTight: 'space-y-3',
    },
    radius: {
        card: 'rounded-lg',
        control: 'rounded-md',
        pill: 'rounded-full',
    },
    shadow: {
        card: 'shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)]',
        focus: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    },
} as const;

export const designTokens = mendrTokens;
export const INK = mendrTokens.colors.ink;
export const PRIMARY = mendrTokens.colors.primary;
export type DesignTokenKey = keyof typeof designTokens;
