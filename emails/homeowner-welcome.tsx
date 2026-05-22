import { HomeownerWelcomeEmail } from '../src/lib/email/templates/homeowner-welcome';

export default function Preview() {
    return (
        <HomeownerWelcomeEmail
            reportUrl="https://mendr.co.za/report/demo-123"
            faultTitle="Penetrating damp — parapet or roof flashing failure"
            suburb="Observatory"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
