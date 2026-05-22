import { WaitlistNotificationEmail } from '../src/lib/email/templates/waitlist-notification';

export default function Preview() {
    return (
        <WaitlistNotificationEmail
            suburb="Stellenbosch"
            siteUrl="https://mendr.co.za"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
