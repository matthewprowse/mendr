import { ContractorApplicationReceivedEmail } from '../src/lib/email/templates/contractor-application-received';

export default function Preview() {
    return (
        <ContractorApplicationReceivedEmail
            firstName="Reza"
            businessName="Reza Electrical CC"
        />
    );
}
