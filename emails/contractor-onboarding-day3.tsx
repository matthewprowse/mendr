import { ContractorOnboardingDay3Email } from '../src/lib/email/templates/contractor-onboarding-day3';

export default function Preview() {
    return (
        <ContractorOnboardingDay3Email
            firstName="Reza"
            profileUrl="https://mendr.co.za/contractors/profile/edit"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
