'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

type VerificationDoc = {
    id: string;
    document_type: string;
    document_url: string;
    status: string;
};

const DOC_TYPES = [
    { key: 'id_document', label: 'SA ID / Passport' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'coidc', label: 'COID / COIDC' },
    { key: 'business_reg', label: 'Business Registration' },
] as const;

export function SettingsClient({
    slug,
    planTier,
    baseCalloutFee,
    ratePerKm,
}: {
    slug: string;
    planTier: string;
    baseCalloutFee: number | null;
    ratePerKm: number | null;
}) {
    const [docs, setDocs] = useState<VerificationDoc[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [uploadingType, setUploadingType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pendingTypeRef = useRef<string | null>(null);

    useEffect(() => {
        const loadDocs = async () => {
            setLoadingDocs(true);
            setError(null);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) {
                    setDocs([]);
                    setLoadingDocs(false);
                    return;
                }
                const { data, error } = await supabase
                    .from('provider_verification')
                    .select('id, document_type, document_url, status')
                    .eq('provider_id', user.id);
                if (error) {
                    console.error('Load verification docs error:', error);
                    setError('Failed to load verification documents.');
                    setDocs([]);
                } else {
                    setDocs(data ?? []);
                }
            } finally {
                setLoadingDocs(false);
            }
        };
        loadDocs();
    }, []);

    const handleChooseFile = (docType: string) => {
        pendingTypeRef.current = docType;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        const docType = pendingTypeRef.current;
        if (!file || !docType) return;
        pendingTypeRef.current = null;

        setUploadingType(docType);
        setError(null);
        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                setError('You must be signed in to upload documents.');
                return;
            }

            const ext = file.name.split('.').pop() || 'pdf';
            const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '_');
            const path = `provider_verification/${safeSlug}/${docType}/${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}.${ext}`;

            const { error: upErr } = await supabase.storage
                .from('vault')
                .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
            if (upErr) {
                console.error('Upload verification doc error:', upErr);
                setError(upErr.message || 'Upload failed.');
                return;
            }

            const { data: { publicUrl } } = supabase.storage.from('vault').getPublicUrl(path);

            const { data, error: insertErr } = await supabase
                .from('provider_verification')
                .insert({
                    provider_id: user.id,
                    document_type: docType,
                    document_url: publicUrl,
                })
                .select('id, document_type, document_url, status');
            if (insertErr) {
                console.error('Insert verification doc error:', insertErr);
                setError(insertErr.message || 'Failed to save document.');
                return;
            }
            if (data && data.length > 0) {
                setDocs((prev) => {
                    const others = prev.filter((d) => d.document_type !== docType);
                    return [...others, data[0]];
                });
            }
        } catch (e) {
            console.error('Verification upload error:', e);
            setError('Failed to upload document. Please try again.');
        } finally {
            setUploadingType(null);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-muted-foreground text-sm">
                    Your Pro account and business settings.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm">
                        <span className="text-muted-foreground">Slug:</span> {slug}
                    </p>
                    <p className="text-sm">
                        <span className="text-muted-foreground">Plan:</span>{' '}
                        {planTier.replace(/_/g, ' ')}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm">
                        <span className="text-muted-foreground">Base call-out fee:</span>{' '}
                        {baseCalloutFee != null ? `R ${baseCalloutFee}` : 'Not set'}
                    </p>
                    <p className="text-sm">
                        <span className="text-muted-foreground">Rate per km:</span>{' '}
                        {ratePerKm != null ? `R ${ratePerKm}` : 'Not set'}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Verification documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        Upload your ID, insurance, COIDC, and business registration so we can verify your
                        account for your current plan.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        accept=".pdf,image/*"
                    />
                    <div className="space-y-3">
                        {DOC_TYPES.map((doc) => {
                            const existing = docs.find((d) => d.document_type === doc.key);
                            return (
                                <div
                                    key={doc.key}
                                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                                >
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">{doc.label}</p>
                                        {existing ? (
                                            <p className="text-xs text-muted-foreground">
                                                Uploaded · Status: {existing.status}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Not uploaded yet.
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleChooseFile(doc.key)}
                                        disabled={uploadingType === doc.key}
                                    >
                                        {uploadingType === doc.key ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                    {loadingDocs && (
                        <p className="text-xs text-muted-foreground">Loading existing documents…</p>
                    )}
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}
