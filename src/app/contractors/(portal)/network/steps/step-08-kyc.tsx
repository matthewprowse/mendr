'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWizard } from './wizard-context';
import { OptionalLabel, StepHeader } from './shared-ui';
import type { KycFile } from './types';

export function StepKyc() {
    const { kycId, kycSelfie, setKycId, setKycSelfie } = useWizard();
    const [busyId, setBusyId] = useState(false);
    const [busySelfie, setBusySelfie] = useState(false);
    const idRef = useRef<HTMLInputElement>(null);
    const selfieRef = useRef<HTMLInputElement>(null);

    const uploadKyc = async (
        kind: 'kyc_id' | 'kyc_selfie',
        file: File,
        setter: (next: KycFile | null) => void,
        setBusy: (b: boolean) => void
    ) => {
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set('kind', kind);
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
            const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
            setter({
                path: json.path,
                bucket: json.bucket,
                fileName: json.fileName || file.name,
                previewUrl,
            });
            toast.success(kind === 'kyc_id' ? 'ID document saved.' : 'Selfie saved.');
        } catch {
            toast.error('Could not upload.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Identity (Optional)"
                description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <OptionalLabel>ID or passport</OptionalLabel>
                    <input
                        ref={idRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,image/heic,image/heif,.heic,.heif"
                        className="sr-only"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (e.target) e.target.value = '';
                            if (!f) return;
                            void uploadKyc('kyc_id', f, setKycId, setBusyId);
                        }}
                        disabled={busyId}
                    />
                    {kycId ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3 text-sm">
                            <span className="truncate">{kycId.fileName}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 shrink-0"
                                onClick={() => {
                                    if (kycId.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(kycId.previewUrl);
                                    setKycId(null);
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <Button
                            type="button"
                            variant="secondary"
                            className="h-10 w-full"
                            disabled={busyId}
                            onClick={() => idRef.current?.click()}
                        >
                            {busyId ? 'Uploading…' : 'Upload ID or passport'}
                        </Button>
                    )}
                </div>
                <div className="flex flex-col gap-3">
                    <OptionalLabel>Selfie</OptionalLabel>
                    <input
                        ref={selfieRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                        className="sr-only"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (e.target) e.target.value = '';
                            if (!f) return;
                            void uploadKyc('kyc_selfie', f, setKycSelfie, setBusySelfie);
                        }}
                        disabled={busySelfie}
                    />
                    {kycSelfie ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3 text-sm">
                            <span className="truncate">{kycSelfie.fileName}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 shrink-0"
                                onClick={() => {
                                    if (kycSelfie.previewUrl?.startsWith('blob:'))
                                        URL.revokeObjectURL(kycSelfie.previewUrl);
                                    setKycSelfie(null);
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <Button
                            type="button"
                            variant="secondary"
                            className="h-10 w-full"
                            disabled={busySelfie}
                            onClick={() => selfieRef.current?.click()}
                        >
                            {busySelfie ? 'Uploading…' : 'Upload selfie'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
