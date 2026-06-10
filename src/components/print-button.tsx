'use client';

import { Button } from '@/components/ui/button';

/** Print/save button used on public provider documents (invoice, quote). */
export function PrintButton() {
    return (
        <div className="print:hidden">
            <Button type="button" onClick={() => window.print()}>
                Print / Save as PDF
            </Button>
        </div>
    );
}
