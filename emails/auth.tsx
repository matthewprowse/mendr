import { MendrAuthEmail } from '../src/lib/email/templates/auth';

export default function Preview() {
    return (
        <MendrAuthEmail
            preview="Confirm your email to finish signing up."
            heading="Confirm your email"
            body={'Hi Matthew,\n\nUse the button below to confirm your account and start using Mendr.'}
            ctaUrl="https://mendr.co.za/auth/confirm?token=demo"
            ctaLabel="Confirm email"
            otp="481920"
        />
    );
}
