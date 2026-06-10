'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type DiagnosisLeaveDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called when the user confirms leaving (e.g. `router.back()`). */
    onLeave: () => void;
};

export function DiagnosisLeaveDialog({ open, onOpenChange, onLeave }: DiagnosisLeaveDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton>
                <DialogHeader>
                    <DialogTitle>Leave Diagnosis?</DialogTitle>
                    <DialogDescription>
                        Going back can discard progress on this diagnosis. You can start a new scan from
                        the welcome step anytime.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-10 flex-1"
                        onClick={() => onOpenChange(false)}
                    >
                        Continue Diagnosis
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        className="h-10 flex-1"
                        onClick={() => {
                            onOpenChange(false);
                            onLeave();
                        }}
                    >
                        Lose Progress
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
