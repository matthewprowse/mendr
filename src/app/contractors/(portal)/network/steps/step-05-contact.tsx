'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useWizard } from './wizard-context';
import { OptionalLabel, RequiredLabel, StepHeader } from './shared-ui';
import { formatSaPhoneDisplay, normalizeWebsiteToHttps } from './utils';

export function StepContact() {
    const { data, patch, ensureAddress } = useWizard();
    const websiteDisplay = useMemo(
        () => (data.website || '').replace(/^https?:\/\//i, '').replace(/\/+$/g, ''),
        [data.website]
    );

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Contact details"
                description="Business address and the best number for homeowner enquiries. We use the Western Cape for address checks during founding launch."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="address">Business address</RequiredLabel>
                    <Input
                        id="address"
                        className="h-10 text-sm"
                        value={data.address}
                        onChange={(e) => patch({ address: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void ensureAddress();
                            }
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Street and suburb — we normalise this against the map.
                    </p>
                </div>

                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="phone">Phone</RequiredLabel>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-10 text-sm"
                        value={data.phone}
                        onChange={(e) => patch({ phone: formatSaPhoneDisplay(e.target.value) })}
                        placeholder="+27 00 000 0000"
                    />
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="whatsapp"
                            checked={data.whatsappAvailable}
                            onCheckedChange={(checked) => patch({ whatsappAvailable: Boolean(checked) })}
                        />
                        <label htmlFor="whatsapp" className="text-sm leading-relaxed text-foreground">
                            This number is on WhatsApp — you are happy to receive leads there.
                        </label>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="website">Website</OptionalLabel>
                    <Input
                        id="website"
                        className="h-10 text-sm"
                        value={websiteDisplay}
                        onChange={(e) => {
                            const remainder = e.target.value.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
                            patch({ website: remainder ? normalizeWebsiteToHttps(remainder) : '' });
                        }}
                        placeholder="example.com"
                    />
                </div>
            </div>
        </div>
    );
}
