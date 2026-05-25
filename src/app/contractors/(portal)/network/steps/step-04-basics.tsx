'use client';

import { Input } from '@/components/ui/input';
import { useWizard } from './wizard-context';
import { RequiredLabel, StepHeader } from './shared-ui';
import { toTitleCaseWords } from './utils';

export function StepBasics() {
    const { data, patch } = useWizard();
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Business identity"
                description="How you want to appear to homeowners. If you pulled data from search, check it carefully."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="businessName">Business or trading name</RequiredLabel>
                    <Input
                        id="businessName"
                        className="h-10 text-sm"
                        value={data.businessName}
                        onChange={(e) => patch({ businessName: e.target.value })}
                        onBlur={(e) => patch({ businessName: toTitleCaseWords(e.target.value) })}
                        maxLength={90}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="contactPerson">Your full name</RequiredLabel>
                    <Input
                        id="contactPerson"
                        className="h-10 text-sm"
                        value={data.contactPerson}
                        onChange={(e) => patch({ contactPerson: e.target.value })}
                        onBlur={(e) => patch({ contactPerson: toTitleCaseWords(e.target.value) })}
                        maxLength={90}
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="emailAddress">Email</RequiredLabel>
                    <Input
                        id="emailAddress"
                        type="email"
                        className="h-10 text-sm"
                        value={data.emailAddress}
                        onChange={(e) => patch({ emailAddress: e.target.value })}
                        placeholder="name@email.com"
                        autoComplete="email"
                    />
                </div>
            </div>
        </div>
    );
}
