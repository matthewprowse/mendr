import { MonthlyDigestReactEmail } from '../src/lib/email/templates/monthly-digest-react';

export default function PreviewUnregistered() {
    return (
        <MonthlyDigestReactEmail
            businessName="Cape Waterproofing Solutions"
            contactCount={4}
            tradeTypes={['Waterproofing']}
            month="May 2026"
            isRegistered={false}
            siteUrl="https://mendr.co.za"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
