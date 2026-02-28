import * as React from 'react';

/**
 * Central icon module for the app.
 * All icons come from geist-icons (Vercel's Geist icon set) for consistency with
 * ShadCN/Vercel-style UI. Import icons from this file only — never from 'geist-icons' directly.
 *
 * Sizing: Use the iconSize constants or Tailwind size-* classes so icons scale consistently:
 *   - iconSize.xs  = size-3  (12px) — dense UI, checkboxes, small controls
 *   - iconSize.sm  = size-4  (16px) — default inline with text, buttons
 *   - iconSize.md  = size-5  (20px) — emphasis, list avatars
 *   - iconSize.lg  = size-6  (24px) — hero, empty states
 *
 * Usage: <Icon className={iconSize.sm} /> or <Icon className="size-4 text-muted-foreground" />
 * Do not pass the numeric `size` prop; use className for sizing so Tailwind controls it.
 */

export {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Buildings,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Copy,
    Cross,
    Droplet,
    External,
    FileText,
    GridSquare,
    Heart,
    HeartFill,
    Key,
    Layout,
    Lightning,
    Linkedin,
    LoaderCircle,
    Menu,
    MoreVertical,
    Paperclip,
    Pencil,
    RotateCounterClockwise,
    Share,
    Shield,
    SortDescending,
    SidebarLeft,
    StarFill,
    Sun,
    ThumbDown,
    ThumbUp,
    Trash,
    Wrench,
} from 'geist-icons';

/** Standard icon size classes — use with className for consistent sizing. */
export const iconSize = {
    xs: 'size-3',
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-6',
} as const;

/** Chat/UI aliases (geist uses ThumbUp/ThumbDown, RotateCounterClockwise). */
export { ThumbUp as ThumbsUp, ThumbDown as ThumbsDown, RotateCounterClockwise as RotateCcw } from 'geist-icons';

/** Brand/social icons (not in Geist) — use iconSize or size-5 for consistency. */
export function IconInstagram({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className ?? 'size-5'}
            aria-hidden
            {...props}
        >
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
    );
}

export function IconTwitter({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className ?? 'size-5'}
            aria-hidden
            {...props}
        >
            <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
        </svg>
    );
}
