'use client';

import { Button } from '@/components/ui/button';

export function PrintButton() {
    return (
        <div className="print:hidden">
            <Button type="button" onClick={() => window.print()}>
                Print / Save as PDF
            </Button>
        </div>
    );
}
