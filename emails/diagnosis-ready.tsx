import { DiagnosisReadyEmail } from '../src/lib/email/templates/diagnosis-ready';

export default function Preview() {
    return (
        <DiagnosisReadyEmail
            reportUrl="https://mendr.co.za/report/demo-123"
            faultTitle="Penetrating damp — parapet or roof flashing failure"
            urgency="moderate"
            estimatedCost="R2,400–R4,000"
            tradeCategory="Waterproofing"
            suburb="Observatory"
        />
    );
}
