'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClientId } from '@/lib/client-random-id';
import {
    formatSaRegistrationInput,
    isValidSaRegistrationNumber,
    registrationNumberPlaceholder,
} from '../sa-registration';
import { useWizard } from './wizard-context';
import { OptionalLabel, RequiredLabel, SectionLabel, StepHeader } from './shared-ui';
import { RESPONSE_TIME_OPTIONS } from './types';
import { tokenizeCsv } from './utils';

export function StepProfile() {
    const {
        data,
        patch,
        registrationCertificate,
        setRegistrationCertificate,
        certificationFiles,
        setCertificationFiles,
    } = useWizard();
    const certificationChips = useMemo(() => tokenizeCsv(data.certifications), [data.certifications]);
    const regValid = isValidSaRegistrationNumber(data.registrationNumber);
    const regTouched = data.registrationNumber.trim().length > 0;
    const [regCertBusy, setRegCertBusy] = useState(false);
    const [certLabelDraft, setCertLabelDraft] = useState('');
    const [certFileBusy, setCertFileBusy] = useState(false);

    const regFileInputRef = useRef<HTMLInputElement>(null);
    const certFileInputRef = useRef<HTMLInputElement>(null);

    const handleRegistrationCertFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;
        setRegCertBusy(true);
        try {
            const fd = new FormData();
            fd.set('file', file);
            const res = await fetch('/api/providers/application-registration-cert', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as {
                path?: string;
                bucket?: string;
                fileName?: string;
                error?: string;
            } | null;
            if (!res.ok || !json?.path || !json.bucket) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const previewUrl =
                file.type.startsWith('image/') && typeof file.type === 'string'
                    ? URL.createObjectURL(file)
                    : undefined;
            setRegistrationCertificate({
                id: createClientId(),
                path: json.path,
                bucket: json.bucket,
                fileName: json.fileName || file.name || 'certificate',
                previewUrl,
            });
            toast.success('Certificate uploaded.');
        } catch {
            toast.error('Could not upload the file.');
        } finally {
            setRegCertBusy(false);
        }
    };

    const handleCertificationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;
        const label = certLabelDraft.trim();
        if (!label) {
            toast.error('Add a label for this certificate (e.g. trade test or safety course).');
            return;
        }
        setCertFileBusy(true);
        try {
            const fd = new FormData();
            fd.set('kind', 'certification');
            fd.set('file', file);
            const res = await fetch('/api/providers/application-document', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as {
                path?: string;
                bucket?: string;
                fileName?: string;
                error?: string;
            } | null;
            if (!res.ok || !json?.path || !json.bucket) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const previewUrl =
                file.type.startsWith('image/') && typeof file.type === 'string'
                    ? URL.createObjectURL(file)
                    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${json.bucket}/${json.path}`;
            setCertificationFiles([
                ...certificationFiles,
                {
                    id: createClientId(),
                    path: json.path,
                    bucket: json.bucket,
                    label,
                    previewUrl,
                },
            ]);
            setCertLabelDraft('');
            toast.success('Certification attached.');
        } catch {
            toast.error('Could not upload the file.');
        } finally {
            setCertFileBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Business Profile"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-6">
                <SectionLabel>Business Details</SectionLabel>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="foundedYear">Year founded</RequiredLabel>
                        <Input
                            id="foundedYear"
                            type="number"
                            inputMode="numeric"
                            min="1900"
                            max="2100"
                            className="h-10"
                            value={data.foundedYear}
                            onChange={(e) => patch({ foundedYear: e.target.value.replace(/[^\d]/g, '') })}
                        />
                    </div>
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="teamSize">Team size</RequiredLabel>
                        <Input
                            id="teamSize"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            className="h-10"
                            value={data.teamSize}
                            onChange={(e) => patch({ teamSize: e.target.value.replace(/[^\d]/g, '') })}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="registrationNumber">CIPC registration number</OptionalLabel>
                    <Input
                        id="registrationNumber"
                        className="h-10"
                        value={data.registrationNumber}
                        onChange={(e) => {
                            const next = formatSaRegistrationInput(e.target.value);
                            patch({ registrationNumber: next });
                            if (!isValidSaRegistrationNumber(next)) {
                                if (registrationCertificate?.previewUrl?.startsWith('blob:')) {
                                    URL.revokeObjectURL(registrationCertificate.previewUrl);
                                }
                                setRegistrationCertificate(null);
                            }
                        }}
                        placeholder={registrationNumberPlaceholder()}
                        autoComplete="off"
                    />
                    {regTouched && !regValid ? (
                        <p className="text-xs text-destructive">Enter Complete Registration Number.</p>
                    ) : null}
                </div>

                {regValid ? (
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="registrationCertFile">Registration Certificate</RequiredLabel>
                        <input
                            ref={regFileInputRef}
                            id="registrationCertFile"
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            onChange={(e) => void handleRegistrationCertFile(e)}
                            disabled={regCertBusy}
                        />
                        {!registrationCertificate ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={regCertBusy}
                                onClick={() => regFileInputRef.current?.click()}
                            >
                                {regCertBusy ? 'Uploading…' : 'Upload registration certificate'}
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
                                <p className="text-sm text-foreground">{registrationCertificate.fileName}</p>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-10 flex-1"
                                        onClick={() => regFileInputRef.current?.click()}
                                        disabled={regCertBusy}
                                    >
                                        Replace file
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-10 flex-1"
                                        onClick={() => {
                                            if (registrationCertificate.previewUrl?.startsWith('blob:')) {
                                                URL.revokeObjectURL(registrationCertificate.previewUrl);
                                            }
                                            setRegistrationCertificate(null);
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}

                <Separator />

                <SectionLabel>Your Story</SectionLabel>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="bio">About your business</RequiredLabel>
                    <Textarea
                        id="bio"
                        className="h-24 text-sm"
                        value={data.bio}
                        onChange={(e) => patch({ bio: e.target.value })}
                        placeholder="What should homeowners know before they call?"
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="highlights">Highlights</RequiredLabel>
                    <Textarea
                        id="highlights"
                        className="h-24 text-sm"
                        value={data.highlights}
                        onChange={(e) => patch({ highlights: e.target.value })}
                        placeholder="Warranty, speed, materials you prefer, areas of expertise…"
                    />
                </div>

                <Separator />

                <SectionLabel>Service Terms</SectionLabel>
                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="insuranceCover">Insurance cover</OptionalLabel>
                    <Input
                        id="insuranceCover"
                        className="h-10 text-sm"
                        value={data.insuranceCover}
                        onChange={(e) => patch({ insuranceCover: e.target.value })}
                        placeholder="e.g. Public liability up to R5m"
                    />
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="typicalResponseTime">Typical response time</OptionalLabel>
                    <Select
                        value={data.typicalResponseTime}
                        onValueChange={(v) => patch({ typicalResponseTime: v })}
                    >
                        <SelectTrigger
                            id="typicalResponseTime"
                            className="h-10 min-h-10 w-full data-[size=default]:h-10"
                        >
                            <SelectValue placeholder="How fast do you usually respond?" />
                        </SelectTrigger>
                        <SelectContent>
                            {RESPONSE_TIME_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-4">
                        <OptionalLabel htmlFor="pricingModel">Pricing model</OptionalLabel>
                        <Input
                            id="pricingModel"
                            className="h-10 text-sm"
                            value={data.pricingModel}
                            onChange={(e) => patch({ pricingModel: e.target.value })}
                            placeholder="e.g. Fixed callout, then quoted"
                        />
                    </div>
                    <div className="flex flex-col gap-4">
                        <OptionalLabel htmlFor="calloutFee">Call-out fee (R)</OptionalLabel>
                        <Input
                            id="calloutFee"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            className="h-10 text-sm"
                            value={data.calloutFee}
                            onChange={(e) => patch({ calloutFee: e.target.value.replace(/[^\d]/g, '') })}
                            placeholder="e.g. 450"
                        />
                    </div>
                </div>

                <Separator />

                <SectionLabel>Certifications</SectionLabel>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="certifications">Certifications (text)</RequiredLabel>
                    <Textarea
                        id="certifications"
                        className="h-24 text-sm"
                        value={data.certifications}
                        onChange={(e) => patch({ certifications: e.target.value })}
                        placeholder="List qualifications — comma-separated"
                    />
                    <div className="flex flex-wrap gap-2">
                        {certificationChips.map((chip, index) => (
                            <Badge key={`${chip}-${index}`} variant="secondary">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="certLabel">Certification documents</OptionalLabel>
                    <p className="text-xs text-muted-foreground">
                        PDF or photo for each ticket, trade test, or membership. Add a label, then upload.
                    </p>
                    <Input
                        id="certLabel"
                        className="h-10 text-sm"
                        value={certLabelDraft}
                        onChange={(e) => setCertLabelDraft(e.target.value)}
                        placeholder="e.g. NQF Painting trade test"
                    />
                    <input
                        ref={certFileInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(ev) => void handleCertificationFile(ev)}
                        disabled={certFileBusy}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full"
                        disabled={certFileBusy}
                        onClick={() => certFileInputRef.current?.click()}
                    >
                        {certFileBusy ? 'Uploading…' : 'Upload certification file'}
                    </Button>
                    {certificationFiles.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                            {certificationFiles.map((c) => (
                                <li
                                    key={c.id}
                                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                                >
                                    <span className="min-w-0 truncate">
                                        {c.label} — {c.path.split('/').pop()}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 shrink-0"
                                        onClick={() => {
                                            if (c.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(c.previewUrl);
                                            setCertificationFiles(certificationFiles.filter((x) => x.id !== c.id));
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>

                <Separator />

                <SectionLabel>How You Heard About Us</SectionLabel>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="referralSource">How did you hear about Mendr?</RequiredLabel>
                    <Select
                        value={data.referralSource}
                        onValueChange={(v) => patch({ referralSource: v })}
                    >
                        <SelectTrigger id="referralSource" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                            <SelectValue placeholder="Select referral source" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Instagram">Instagram</SelectItem>
                            <SelectItem value="Facebook">Facebook</SelectItem>
                            <SelectItem value="Google">Google</SelectItem>
                            <SelectItem value="Contractor">Contractor Referral</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                    {data.referralSource === 'Other' ? (
                        <div className="flex flex-col gap-4">
                            <RequiredLabel htmlFor="referralOther">Tell us more</RequiredLabel>
                            <Input
                                id="referralOther"
                                className="h-10"
                                value={data.referralOther}
                                onChange={(e) => patch({ referralOther: e.target.value })}
                                placeholder="Please specify"
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
