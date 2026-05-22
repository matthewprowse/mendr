import { ContractorApprovedEmail } from '../src/lib/email/templates/contractor-approved';

export default function Preview() {
    return (
        <ContractorApprovedEmail
            firstName="Reza"
            geminiSummary="Reza Electrical CC is a Cape Town-based electrical contractor with over 12 years of residential and light commercial experience. Specialising in DB board upgrades, fault finding, and solar installations across the Southern Suburbs and City Bowl."
            editUrl="https://mendr.co.za/contractors/profile/edit?token=demo-token-abc123"
        />
    );
}
