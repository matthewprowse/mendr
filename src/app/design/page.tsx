import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { META_DESIGN_PREVIEW } from '@/lib/site-metadata';
import { DesignPreviewClient } from './client';

export const metadata: Metadata = META_DESIGN_PREVIEW;

export default function DesignPage() {
    return (
        <div style={{ '--font-menda-sans': "'Circular', ui-sans-serif, system-ui, sans-serif" } as CSSProperties}>
            <DesignPreviewClient />
        </div>
    );
}
