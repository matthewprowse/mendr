import { format } from 'date-fns';

/** Long, human date used across customer pages, e.g. "Thursday, 30 May 2026". */
export function formatLongDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'EEEE, d MMMM yyyy');
}

/** Relative date matching the History list, e.g. "Today", "3 Days Ago", "5 Mar". */
export function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays < 2) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} Days Ago`;
    return d.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}
