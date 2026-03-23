import { SERVICE_LABELS } from './services';

export type ServiceLabel = (typeof SERVICE_LABELS)[number];

export const SERVICE_ITEMS: Array<{ label: ServiceLabel }> = SERVICE_LABELS.map((label) => ({
    label,
}));
