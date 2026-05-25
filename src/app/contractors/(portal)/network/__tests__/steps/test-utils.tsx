/**
 * Helpers shared by the per-step DOM tests.
 *
 * The wizard context owns a lot of state and side effects (sessionStorage,
 * existing-application fetch, etc.); these tests want to isolate one step
 * at a time. The default render wraps the supplied step in a real
 * `WizardProvider`, optionally pre-seeding state by reaching into
 * sessionStorage before mount.
 */

import { render, type RenderResult } from '@testing-library/react';
import { WizardProvider } from '../../steps/wizard-context';
import { EMPTY_FORM, SESSION_KEY, type FormData, type ServiceRadius, type UploadedImage, type CertificationFile, type RegistrationCertificate, type KycFile } from '../../steps/types';

type SeedState = {
    step?: number;
    data?: Partial<FormData>;
    radii?: ServiceRadius[];
    uploads?: UploadedImage[];
    registrationCertificate?: RegistrationCertificate | null;
    certificationFiles?: CertificationFile[];
    kycId?: KycFile | null;
    kycSelfie?: KycFile | null;
};

export function seedSessionState(state: SeedState) {
    const payload = {
        step: state.step ?? 1,
        data: { ...EMPTY_FORM, ...(state.data ?? {}) },
        radii: state.radii ?? [],
        uploads: state.uploads ?? [],
        registrationCertificate: state.registrationCertificate ?? null,
        certificationFiles: state.certificationFiles ?? [],
        kycId: state.kycId ?? null,
        kycSelfie: state.kycSelfie ?? null,
    };
    try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
        /* ignore */
    }
}

export function renderWithWizard(ui: React.ReactNode): RenderResult {
    return render(<WizardProvider>{ui}</WizardProvider>);
}
