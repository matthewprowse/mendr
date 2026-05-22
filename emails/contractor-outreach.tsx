import { ContractorOutreachEmail } from '../src/lib/email/templates/contractor-outreach';

export default function Preview() {
    return (
        <ContractorOutreachEmail
            businessName="Cape Waterproofing Solutions"
            contactCount={7}
            tradeType="Waterproofing"
            month="May 2026"
            applyUrl="https://mendr.co.za/contractors/network"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
