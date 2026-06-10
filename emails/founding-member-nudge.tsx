import { FoundingMemberNudgeEmail } from '../src/lib/email/templates/founding-member-nudge';

export default function Preview() {
    return (
        <FoundingMemberNudgeEmail
            firstName="Reza"
            spotsRemaining={12}
            profileUrl="https://mendr.co.za/contractors/profile/edit"
            unsubscribeUrl="https://mendr.co.za/api/unsubscribe?token=demo"
        />
    );
}
