/**
 * Icon mapping for services/trades in the navigation and chat.
 * Uses geist-icons for consistency with the rest of the app.
 */

import {
    Lightning,
    Droplet,
    Shield,
    Buildings,
    Layout,
    GridSquare,
    Wrench,
    Key,
    Pencil,
    Trash,
    Sun,
} from 'geist-icons';

const iconMap = {
    Electrical: Lightning,
    Plumbing: Droplet,
    'Security & Access': Shield,
    'Building & Construction': Buildings,
    'Carpentry & Woodwork': Layout,
    'Flooring & Tiling': GridSquare,
    'General Handyman': Wrench,
    'Locksmith Services': Key,
    Painting: Pencil,
    'Pool Maintenance': Sun,
    'Rubble & Waste Removal': Trash,
    Welding: Wrench,
} as const;

export type ServiceLabel = keyof typeof iconMap;

export function getServiceIcon(label: ServiceLabel) {
    return iconMap[label] ?? Wrench;
}

export const SERVICE_ITEMS: { label: ServiceLabel; href?: string }[] = [
    { label: 'Electrical' },
    { label: 'Plumbing' },
    { label: 'Security & Access' },
    { label: 'Building & Construction' },
    { label: 'Carpentry & Woodwork' },
    { label: 'Flooring & Tiling' },
    { label: 'General Handyman' },
    { label: 'Locksmith Services' },
    { label: 'Painting' },
    { label: 'Pool Maintenance' },
    { label: 'Rubble & Waste Removal' },
    { label: 'Welding' },
];
