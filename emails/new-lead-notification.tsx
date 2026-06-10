import { NewLeadNotificationEmail } from '../src/lib/email/templates/new-lead-notification';

export default function Preview() {
    return (
        <NewLeadNotificationEmail
            contractorFirstName="Reza"
            homeownerSuburb="Observatory"
            faultTitle="DB trip with burning smell at distribution board"
            faultCategory="Electrical"
            urgency="high"
            estimatedCost="R1,800–R3,500"
            leadUrl="https://mendr.co.za/contractors/leads/demo-lead-id"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
