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

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FlowStepHeader } from '@/components/flow-header';
import {
    FOOTER_SCROLL_GAP_PX,
    FOOTER_SCROLL_MIN_PX,
    STEP,
    TOTAL_STEPS,
} from './steps/types';
import { WizardProvider, useWizard } from './steps/wizard-context';
import { StepContractorType } from './steps/step-01-contractor-type';
import { StepWillingnessToPay } from './steps/step-02-willingness-to-pay';
import { StepCompanySearch } from './steps/step-03-company-search';
import { StepBasics } from './steps/step-04-basics';
import { StepContact } from './steps/step-05-contact';
import { StepServiceAreas } from './steps/step-06-service-areas';
import { StepTrade } from './steps/step-07-trade';
import { StepProfile } from './steps/step-08-profile';
import { StepKyc } from './steps/step-09-kyc';
import { StepGallery } from './steps/step-10-gallery';
import { StepConfirm } from './steps/step-11-confirm';

function CurrentStep() {
    const { step } = useWizard();
    switch (step) {
        case STEP.CONTRACTOR_TYPE:
            return <StepContractorType />;
        case STEP.WILLINGNESS_TO_PAY:
            return <StepWillingnessToPay />;
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
        footerRef,
        footerHeight,
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

    if (submitted) return <SuccessScreen />;

    /** Scroll clearance so the last field sits above the fixed footer. */
    const bottomScrollClearancePx = Math.max(
        footerHeight + FOOTER_SCROLL_GAP_PX,
        FOOTER_SCROLL_MIN_PX + FOOTER_SCROLL_GAP_PX
    );

    return (
        <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background">
            <FlowStepHeader step={step} onBack={goBack} centerLabel="Mendr" />
            <main
                ref={contentRef}
                className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 pt-20 sm:px-6"
            >
                <div className="flex w-full min-w-0 max-w-xl flex-col gap-8">
                    <CurrentStep />
                    <div
                        aria-hidden
                        className="shrink-0"
                        style={{
                            height: `${bottomScrollClearancePx}px`,
                            minHeight: `${bottomScrollClearancePx}px`,
                        }}
                    />
                </div>
            </main>
            <div
                ref={footerRef}
                className="fixed inset-x-0 bottom-0 z-40 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
                <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                    <Button
                        type="button"
                        className="h-10 w-full"
                        disabled={!canContinue() || submitting}
                        onClick={() => void goNext()}
                    >
                        {submitting ? 'Submitting...' : step === TOTAL_STEPS ? 'Submit Application' : 'Continue'}
                    </Button>
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
                                router.push('/contractors');
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
                    Thank you for applying to join the Mendr contractor network. We&apos;ll review your application and
                    be in touch within 2 business days.
                </p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/contractors')}>
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
