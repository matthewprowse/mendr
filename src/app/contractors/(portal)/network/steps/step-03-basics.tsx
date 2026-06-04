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
                title="Business Identity"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="businessName">Business Name</RequiredLabel>
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
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="firstName">First Name</RequiredLabel>
                    <Input
                        id="firstName"
                        className="h-10 text-sm"
                        value={data.firstName}
                        onChange={(e) => patch({ firstName: e.target.value })}
                        onBlur={(e) => patch({ firstName: toTitleCaseWords(e.target.value) })}
                        maxLength={60}
                        autoComplete="given-name"
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="surname">Surname</RequiredLabel>
                    <Input
                        id="surname"
                        className="h-10 text-sm"
                        value={data.surname}
                        onChange={(e) => patch({ surname: e.target.value })}
                        onBlur={(e) => patch({ surname: toTitleCaseWords(e.target.value) })}
                        maxLength={60}
                        autoComplete="family-name"
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <RequiredLabel htmlFor="emailAddress">Email Address</RequiredLabel>
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
