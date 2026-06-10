import { MonthlyDigestReactEmail } from '../src/lib/email/templates/monthly-digest-react';

export default function PreviewRegistered() {
    return (
        <MonthlyDigestReactEmail
            businessName="Reza Electrical CC"
            contactCount={9}
            tradeTypes={['Electrical', 'DB Board Upgrades']}
            month="May 2026"
            isRegistered={true}
            siteUrl="https://mendr.co.za"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
