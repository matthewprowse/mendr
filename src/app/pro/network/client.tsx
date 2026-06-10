'use client';

/**
 * Contractor onboarding wizard — thin orchestrator.
 *
 * The previous version of this file was a 2,285-line monolith holding all
 * 11 step components inline. State and steps have been hoisted to
 * `steps/wizard-context.tsx` and `steps/step-NN-*.tsx` respectively.
 *
 * What lives here now:
 *   • Page wrapper that mounts `WizardProvider`
 *   • The visual chrome (header, footer continue button, leave + existing dialogs)
 *   • Step switch — picks the right step component for the current step index
 *   • Success screen for after submission
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FlowTopBar } from '@/components/match/flow-shell';
import { ProAccountMenu } from '@/components/pro-account-menu';
import { BRAND_NAME_PRO } from '@/lib/brand-system';
import { STEP, TOTAL_STEPS } from './steps/types';
import { WizardProvider, useWizard } from './steps/wizard-context';
import { StepContractorType } from './steps/step-01-contractor-type';
import { StepCompanySearch } from './steps/step-02-company-search';
import { StepBasics } from './steps/step-03-basics';
import { StepContact } from './steps/step-04-contact';
import { StepServiceAreas } from './steps/step-05-service-areas';
import { StepTrade } from './steps/step-06-trade';
import { StepProfile } from './steps/step-07-profile';
import { StepKyc } from './steps/step-08-kyc';
import { StepGallery } from './steps/step-09-gallery';
import { StepConfirm } from './steps/step-10-confirm';

function CurrentStep() {
    const { step } = useWizard();
    switch (step) {
        case STEP.CONTRACTOR_TYPE:
            return <StepContractorType />;
        case STEP.COMPANY_SEARCH:
            return <StepCompanySearch />;
        case STEP.BASICS:
            return <StepBasics />;
        case STEP.CONTACT:
            return <StepContact />;
        case STEP.SERVICE:
            return <StepServiceAreas />;
        case STEP.TRADE:
            return <StepTrade />;
        case STEP.PROFILE:
            return <StepProfile />;
        case STEP.KYC:
            return <StepKyc />;
        case STEP.GALLERY:
            return <StepGallery />;
        case STEP.CONFIRM:
            return <StepConfirm />;
        default:
            return null;
    }
}

function WizardShell() {
    const router = useRouter();
    const {
        step,
        goNext,
        goBack,
        canContinue,
        submitting,
        submitted,
        contentRef,
        leaveDialogOpen,
        setLeaveDialogOpen,
        existingDialogOpen,
        setExistingDialogOpen,
        existingApplication,
        existingDialogBusy,
        hydrateFromExisting,
        deleteExistingApplication,
    } = useWizard();

    // Swap the header wordmark for the step title once the step's <h1> scrolls
    // up behind the top bar (mirrors /diagnoses and /start).
    const [scrolledTitle, setScrolledTitle] = useState<string | null>(null);
    useEffect(() => {
        const root = contentRef.current;
        if (!root) return;
        setScrolledTitle(null);
        const update = () => {
            const h1 = root.querySelector('h1');
            if (!h1) {
                setScrolledTitle(null);
                return;
            }
            const scrolledOut = h1.getBoundingClientRect().bottom <= root.getBoundingClientRect().top;
            setScrolledTitle(scrolledOut ? h1.textContent?.trim() || null : null);
        };
        update();
        root.addEventListener('scroll', update, { passive: true });
        return () => root.removeEventListener('scroll', update);
    }, [contentRef, step]);

    if (submitted) return <SuccessScreen />;

    return (
        <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background">
            <FlowTopBar
                className="p-4"
                leftSlot={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Go back"
                        onClick={goBack}
                    >
                        <ArrowLeft strokeWidth={2.5} />
                    </Button>
                }
                centerSlot={
                    <p className="pointer-events-none absolute left-1/2 top-1/2 max-w-[70%] -translate-x-1/2 -translate-y-1/2 truncate text-center text-base font-medium text-foreground">
                        {scrolledTitle ?? BRAND_NAME_PRO}
                    </p>
                }
                rightSlot={
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                            Step {step}/{TOTAL_STEPS}
                        </Badge>
                        <ProAccountMenu />
                    </div>
                }
            />
            <main ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex min-h-full flex-col justify-center p-4">
                    <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-8">
                        <CurrentStep />
                    </div>
                </div>
            </main>
            <div className="sticky bottom-0 shrink-0 bg-background p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
                    <Button
                        type="button"
                        className="h-10 w-full"
                        disabled={!canContinue() || submitting}
                        onClick={() => void goNext()}
                    >
                        {submitting ? 'Submitting...' : step === TOTAL_STEPS ? 'Submit Application' : 'Continue'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                    </p>
                </div>
            </div>

            <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Leave Application?</DialogTitle>
                        <DialogDescription>
                            Going back now will discard your onboarding progress.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 flex-1"
                            onClick={() => setLeaveDialogOpen(false)}
                        >
                            Continue Application
                        </Button>
                        <Button
                            type="button"
                            className="h-10 flex-1"
                            onClick={() => {
                                setLeaveDialogOpen(false);
                                router.push('/pro');
                            }}
                        >
                            Lose Progress
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={existingDialogOpen} onOpenChange={setExistingDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Existing Application Found</DialogTitle>
                        <DialogDescription>
                            We found an existing provider application for this phone/IP. Do you want to continue it or
                            delete and start over?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 flex-1"
                            disabled={existingDialogBusy || !existingApplication}
                            onClick={() => {
                                if (!existingApplication) return;
                                hydrateFromExisting(existingApplication);
                                setExistingDialogOpen(false);
                            }}
                        >
                            Continue Existing
                        </Button>
                        <Button
                            type="button"
                            className="h-10 flex-1"
                            disabled={existingDialogBusy || !existingApplication}
                            onClick={() => void deleteExistingApplication()}
                        >
                            Delete And Start Over
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SuccessScreen() {
    const router = useRouter();
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-background"
                >
                    <path d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">Application Received</h1>
                <p className="max-w-sm text-base text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
                    et dolore.
                </p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/pro')}>
                Back To Pro Page
            </Button>
        </div>
    );
}

export default function ProOnboardPage() {
    return (
        <WizardProvider>
            <WizardShell />
        </WizardProvider>
    );
}
