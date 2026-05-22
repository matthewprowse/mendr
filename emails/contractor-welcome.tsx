import { ContractorWelcomeEmail } from '../src/lib/email/templates/contractor-welcome';

export default function Preview() {
    return (
        <ContractorWelcomeEmail
            firstName="Reza"
            businessName="Reza Electrical CC"
            profileUrl="https://mendr.co.za/contractors/profile/edit"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
