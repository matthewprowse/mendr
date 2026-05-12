import type { Metadata } from 'next';
import { META_DESIGN_PREVIEW } from '@/lib/site-metadata';
import { DesignPreviewClient } from './client';

export const metadata: Metadata = META_DESIGN_PREVIEW;

export default function DesignPage() {
    return <DesignPreviewClient />;
}
