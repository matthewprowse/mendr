import { HomeownerReengagementEmail } from '../src/lib/email/templates/homeowner-reengagement';

export default function Preview() {
    return (
        <HomeownerReengagementEmail
            diagnosisCount={3}
            lastFaultTitle="Rust stains on exterior render — coastal corrosion"
            siteUrl="https://mendr.co.za"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
