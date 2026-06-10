import { ContractorOnboardingDay7Email } from '../src/lib/email/templates/contractor-onboarding-day7';

export default function Preview() {
    return (
        <ContractorOnboardingDay7Email
            firstName="Reza"
            leadsUrl="https://mendr.co.za/contractors/leads"
            siteUrl="https://mendr.co.za"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
