export const mendaTokens = {
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
        fontFamily: 'Sohne',
        weights: {
            light: 300,
            regular: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        } as const,
        scale: {
            display: { size: '2.25rem', weight: 600, lineHeight: '1.15' },
            h1: { size: '1.5rem', weight: 600, lineHeight: '1.25' },
            h2: { size: '1.25rem', weight: 600, lineHeight: '1.3' },
            h3: { size: '1rem', weight: 600, lineHeight: '1.4' },
            bodyLg: { size: '1rem', weight: 400, lineHeight: '1.75' },
            body: { size: '0.875rem', weight: 400, lineHeight: '1.6' },
            label: { size: '0.875rem', weight: 500, lineHeight: '1.4' },
            micro: { size: '0.75rem', weight: 500, lineHeight: '1.4' },
        } as const,
        /** Tailwind utility classes for use in JSX className props */
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
        focus: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DCF763]',
    },
} as const;

export const designTokens = mendaTokens;
export const INK = mendaTokens.colors.ink;
export const PRIMARY = mendaTokens.colors.primary;
export type DesignTokenKey = keyof typeof designTokens;
