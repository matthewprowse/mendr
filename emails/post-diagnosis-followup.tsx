import { PostDiagnosisFollowupEmail } from '../src/lib/email/templates/post-diagnosis-followup';

export default function Preview() {
    return (
        <PostDiagnosisFollowupEmail
            reportUrl="https://mendr.co.za/report/demo-123"
            faultTitle="Penetrating damp — parapet or roof flashing failure"
            urgency="high"
            contractorsUrl="https://mendr.co.za/match/demo-123"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
