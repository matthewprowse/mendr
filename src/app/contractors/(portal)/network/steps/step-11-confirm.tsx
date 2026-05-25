'use client';

import { useWizard } from './wizard-context';
import { StepHeader } from './shared-ui';
import { WILLINGNESS_OPTIONS, type ContractorType } from './types';

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-input bg-card p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
            <div className="flex flex-col gap-1.5 text-sm">{children}</div>
        </div>
    );
}

function wtpLabel(band: string): string {
    const o = WILLINGNESS_OPTIONS.find((x) => x.value === band);
    return o?.label ?? (band || '—');
}

function contractorTypeLabel(t: ContractorType | ''): string {
    if (t === 'individual') return 'Individual';
    if (t === 'team') return 'Team';
    if (t === 'enterprise') return 'Enterprise';
    return '—';
}

export function StepConfirm() {
    const { data, radii, uploads, registrationCertificate, certificationFiles, kycId, kycSelfie } = useWizard();
    const referralLabel =
        data.referralSource === 'Other' ? data.referralOther.trim() || 'Other' : data.referralSource || '—';
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Review and submit"
                description="Check everything below. You can use Back to fix a step before sending your application."
            />
            <div className="flex flex-col gap-6">
                <SummaryCard title="How you work">
                    <p className="text-muted-foreground">Type: {contractorTypeLabel(data.contractorType)}</p>
                    <p className="text-muted-foreground">
                        Comfortable monthly range: {wtpLabel(data.willingnessToPayBand)}
                    </p>
                    {data.applicantGooglePlaceId ? (
                        <p className="text-muted-foreground break-all text-xs">
                            Maps listing: {data.applicantGooglePlaceId}
                        </p>
                    ) : (
                        <p className="text-muted-foreground">Maps listing: not linked</p>
                    )}
                </SummaryCard>
                <SummaryCard title="Business">
                    <p>{data.businessName || '—'}</p>
                    <p className="text-muted-foreground">{data.contactPerson || '—'}</p>
                    <p className="text-muted-foreground">{data.emailAddress || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Contact Details">
                    <p>{data.address || '—'}</p>
                    <p className="text-muted-foreground">{data.phone || '—'}</p>
                    <p className="text-muted-foreground">
                        {data.whatsappAvailable ? 'WhatsApp enabled' : 'WhatsApp disabled'}
                    </p>
                    <p className="text-muted-foreground">{data.website || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Service Areas">
                    {radii.length > 0 ? (
                        radii.map((r) => (
                            <p key={r.id} className="text-muted-foreground">
                                {r.address} ({r.radiusKm} km)
                            </p>
                        ))
                    ) : (
                        <p className="text-muted-foreground">—</p>
                    )}
                </SummaryCard>
                <SummaryCard title="Trade Profile">
                    <p>{data.trade || '—'}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{data.specialisations || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Business Profile">
                    <p className="text-muted-foreground">Founded year: {data.foundedYear || '—'}</p>
                    <p className="text-muted-foreground">Team size: {data.teamSize || '—'}</p>
                    <p className="text-muted-foreground">Registration: {data.registrationNumber || '—'}</p>
                    {registrationCertificate ? (
                        <p className="text-muted-foreground">
                            Registration certificate: {registrationCertificate.fileName}
                        </p>
                    ) : null}
                    <p className="text-muted-foreground">Bio: {data.bio || '—'}</p>
                    <p className="text-muted-foreground">Certifications: {data.certifications || '—'}</p>
                    {certificationFiles.length > 0 ? (
                        <p className="text-muted-foreground">
                            Certification files: {certificationFiles.map((c) => c.label).join(', ')}
                        </p>
                    ) : null}
                    <p className="text-muted-foreground">Highlights: {data.highlights || '—'}</p>
                    <p className="text-muted-foreground">Referral: {referralLabel}</p>
                </SummaryCard>
                <SummaryCard title="Identity uploads">
                    <p className="text-muted-foreground">ID document: {kycId ? kycId.fileName : '—'}</p>
                    <p className="text-muted-foreground">Selfie: {kycSelfie ? kycSelfie.fileName : '—'}</p>
                </SummaryCard>
                <SummaryCard title="Work photos">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {uploads.map((item) => (
                            <div key={item.id} className="rounded-md border border-input p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.previewUrl}
                                    alt={item.caption || 'Uploaded image'}
                                    className="h-24 w-full rounded object-cover"
                                />
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                    {item.caption || 'No caption'}
                                </p>
                            </div>
                        ))}
                    </div>
                </SummaryCard>
            </div>
        </div>
    );
}
