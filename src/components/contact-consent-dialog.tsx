'use client';

/**
 * Per-contact lead-share consent gate (Phase 2 of the onboarding plan).
 *
 * Shown before a homeowner contacts a specialist when their global mode is
 * `ask_each_time`. Confirming shares their name, number, and enquiry with that
 * specialist (the POPIA disclosure event), whether or not they send a message.
 * The "do not ask again" checkbox upgrades them to `always_share`.
 */

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Version of the consent wording shown. Stored with each consent record so we
 * can prove exactly what the homeowner agreed to. Bump when the copy changes.
 */
export const CONSENT_TEXT_VERSION = '2026-06-04';

export function ContactConsentDialog({
    open,
    onOpenChange,
    businessName,
    onConfirm,
    busy,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessName: string;
    onConfirm: (dontAskAgain: boolean) => void;
    busy?: boolean;
}) {
    const [dontAskAgain, setDontAskAgain] = useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Share your details with {businessName}?</DialogTitle>
                    <DialogDescription>
                        Your name, mobile number, and enquiry details will be shared with{' '}
                        {businessName} so they can help with this job, whether or not you send a
                        message. You can manage or withdraw this anytime in Settings.
                    </DialogDescription>
                </DialogHeader>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                        checked={dontAskAgain}
                        onCheckedChange={(v) => setDontAskAgain(v === true)}
                    />
                    Do not ask again for specialists I contact
                </label>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => onConfirm(dontAskAgain)} disabled={busy}>
                        {busy ? 'Sharing…' : 'Continue'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
