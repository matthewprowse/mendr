'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { AppHeader } from '@/components/app-header';
import { sanitizeAiContent } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ReportMap } from './report-map';
import { toast } from 'sonner';

const VERIFIED_KEY = 'report_verified_';
const OWNER_KEY = 'report_owner_';

type ReportData = {
    diagnosis: any;
    image_url: string | null;
    user_address: string | null;
    user_lat: number | null;
    user_lng: number | null;
    messages?: { content: string; role: string; attachments?: string[] }[];
};

function ReportContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = params?.id as string | undefined;
    const [pin, setPin] = useState('');
    const [verified, setVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Signup form
    const [companyName, setCompanyName] = useState('');
    const [email, setEmail] = useState('');
    const [descriptiveText, setDescriptiveText] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [spendPerMonth, setSpendPerMonth] = useState('');
    const [pricePerLead, setPricePerLead] = useState('');
    const [signupSubmitting, setSignupSubmitting] = useState(false);
    const [signupSuccess, setSignupSuccess] = useState(false);

    const [directionsLoading, setDirectionsLoading] = useState(false);
    const [providerLocation, setProviderLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [directionsAttempted, setDirectionsAttempted] = useState(false);
    const [headerScrolled, setHeaderScrolled] = useState(false);
    const [directions, setDirections] = useState<{
        distance_text: string;
        duration_text: string;
    } | null>(null);

    const checkVerified = useCallback(() => {
        if (!id || typeof window === 'undefined') return false;
        try {
            return (
                sessionStorage.getItem(VERIFIED_KEY + id) === '1' ||
                sessionStorage.getItem(OWNER_KEY + id) === '1'
            );
        } catch {
            return false;
        }
    }, [id]);

    const loadReport = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const { data: conv, error: convError } = await supabase
                .from('conversations')
                .select('diagnosis_json, image_url, user_address, user_lat, user_lng')
                .eq('id', id)
                .maybeSingle();

            if (convError) throw convError;
            if (!conv) {
                setError('Report not found.');
                return;
            }

            const { data: msgs } = await supabase
                .from('messages')
                .select('content, role, attachments')
                .eq('conversation_id', id)
                .order('created_at', { ascending: true });

            setReportData({
                diagnosis: conv.diagnosis_json,
                image_url: conv.image_url,
                user_address: conv.user_address,
                user_lat: conv.user_lat,
                user_lng: conv.user_lng,
                messages: msgs || [],
            });
        } catch (e) {
            console.error('Load report error:', e);
            setError('Failed to load report.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!id) return;
        const token = searchParams.get('t');
        if (token) {
            fetch('/api/report-owner-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: id, token }),
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data.valid) {
                        try {
                            sessionStorage.setItem(OWNER_KEY + id, '1');
                        } catch {}
                        setVerified(true);
                        loadReport();
                        router.replace(`/report/${id}`, { scroll: false });
                    } else {
                        setLoading(false);
                    }
                })
                .catch(() => setLoading(false));
            return;
        }
        if (checkVerified()) {
            setVerified(true);
            loadReport();
        } else {
            setLoading(false);
        }
    }, [id, searchParams, checkVerified, loadReport, router]);

    const handleVerify = async () => {
        if (!id || !pin.trim()) return;
        setVerifying(true);
        setError(null);
        try {
            const res = await fetch('/api/report-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: id, pin: pin.trim() }),
            });
            const data = await res.json();
            if (data.valid) {
                try {
                    sessionStorage.setItem(VERIFIED_KEY + id, '1');
                } catch {}
                setVerified(true);
                loadReport();
            } else {
                setError('Invalid access code. Please try again.');
            }
        } catch (e) {
            setError('Verification failed. Please try again.');
        } finally {
            setVerifying(false);
        }
    };

    const fetchDirections = useCallback(async () => {
        const hasLoc = reportData?.user_lat != null && reportData?.user_lng != null;
        if (!reportData?.user_address && !hasLoc) return;
        setDirectionsLoading(true);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
            );
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setProviderLocation({ lat, lng });
            const origin = `${lat},${lng}`;
            const destination = hasLoc
                ? `${reportData!.user_lat},${reportData!.user_lng}`
                : reportData!.user_address!;
            const res = await fetch(
                `/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
            );
            const data = await res.json();
            if (data.distance_text && data.duration_text) {
                setDirections({ distance_text: data.distance_text, duration_text: data.duration_text });
            }
        } catch {
            toast.error('Could not get your location or directions.');
        } finally {
            setDirectionsLoading(false);
        }
    }, [reportData]);

    useEffect(() => {
        if (reportData && (reportData.user_address || (reportData.user_lat != null && reportData.user_lng != null)) && !directionsAttempted) {
            setDirectionsAttempted(true);
            fetchDirections();
        }
    }, [reportData, directionsAttempted, fetchDirections]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !email.trim()) return;
        setSignupSubmitting(true);
        try {
            const res = await fetch('/api/provider-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName.trim(),
                    email: email.trim(),
                    descriptive_text: descriptiveText.trim() || undefined,
                    team_size: teamSize || undefined,
                    spend_per_month: spendPerMonth || undefined,
                    price_per_lead: pricePerLead.trim() || undefined,
                    report_conversation_id: id || undefined,
                    marketing_consent: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setSignupSuccess(true);
            toast.success('Thank you! We\'ll be in touch soon.');
            setCompanyName('');
            setEmail('');
            setDescriptiveText('');
            setTeamSize('');
            setSpendPerMonth('');
            setPricePerLead('');
        } catch (e) {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setSignupSubmitting(false);
        }
    };

    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
    const hasLocation = reportData?.user_lat != null && reportData?.user_lng != null;
    const destinationForMap = hasLocation
        ? `${reportData!.user_lat},${reportData!.user_lng}`
        : reportData?.user_address || '';
    const showDirectionsMap = providerLocation && hasLocation;
    const directionsMapUrl = providerLocation && hasLocation
        ? mapsKey
            ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${providerLocation.lat},${providerLocation.lng}&destination=${reportData!.user_lat},${reportData!.user_lng}`
            : `https://www.google.com/maps?output=embed&saddr=${providerLocation.lat},${providerLocation.lng}&daddr=${reportData!.user_lat},${reportData!.user_lng}`
        : null;
    if (!id) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Invalid report link.</p>
            </div>
        );
    }

    if (!verified) {
        return (
            <div className="flex flex-col min-h-screen bg-background">
                <AppHeader title="Report" />
                <main className="flex flex-1 items-center justify-center p-4">
                    <div className="w-full max-w-sm space-y-4">
                        <h2 className="text-lg font-semibold text-foreground">Enter Access Code</h2>
                        <p className="text-sm text-muted-foreground">
                            Use the 4-digit code shared with you to view this report.
                        </p>
                        <Input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="0000"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                            className="text-center text-lg tracking-[0.5em]"
                            autoFocus
                        />
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button onClick={handleVerify} disabled={verifying || pin.length !== 4} className="w-full">
                            {verifying ? 'Verifying…' : 'View Report'}
                        </Button>
                    </div>
                </main>
            </div>
        );
    }

    if (loading || !reportData) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Spinner className="size-8 text-muted-foreground" />
            </div>
        );
    }

    const diag = reportData.diagnosis;
    const allImages: string[] = [];
    if (reportData.image_url) allImages.push(reportData.image_url);
    reportData.messages?.forEach((m) => {
        m.attachments?.forEach((url) => {
            if (url && !allImages.includes(url)) allImages.push(url);
        });
    });
    const mainImage = allImages[0];
    const additionalImages = allImages.slice(1);

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <AppHeader title={diag?.diagnosis || 'Job Report'} imageSrc={mainImage} scrolled={headerScrolled} showViewImage={false} />

            <main
                className="flex flex-1 flex-col overflow-y-auto"
                onScroll={(e) => setHeaderScrolled((e.target as HTMLElement).scrollTop > 0)}
            >
                <div className="max-w-4xl mx-auto w-full px-4 md:px-12 py-4 flex flex-col gap-8">
                    {/* Map card - directions from you to customer */}
                    {(reportData.user_address || hasLocation) && destinationForMap && (
                        <section className="rounded-lg border border-border bg-card overflow-hidden w-full">
                            {mapsKey ? (
                                <ReportMap
                                    apiKey={mapsKey}
                                    origin={showDirectionsMap ? providerLocation! : undefined}
                                    destination={
                                        hasLocation
                                            ? { lat: reportData!.user_lat!, lng: reportData!.user_lng! }
                                            : reportData!.user_address!
                                    }
                                />
                            ) : (
                                <div className="w-full aspect-video min-h-[200px] overflow-hidden">
                                    <iframe
                                        title="Directions to job"
                                        src={directionsMapUrl || `https://www.google.com/maps?q=${encodeURIComponent(destinationForMap)}&output=embed`}
                                        className="w-full h-full border-0 block"
                                        allowFullScreen
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    />
                                </div>
                            )}
                            <div className="p-4 flex items-center justify-between gap-4">
                                {reportData.user_address ? (
                                    <span className="text-sm text-muted-foreground min-w-0 truncate">{reportData.user_address}</span>
                                ) : (
                                    <span />
                                )}
                                <Button
                                    variant="secondary"
                                    onClick={() =>
                                        window.open(
                                            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                                reportData.user_address || destinationForMap
                                            )}`,
                                            '_blank'
                                        )
                                    }
                                >
                                    Get Directions
                                </Button>
                            </div>
                        </section>
                    )}


                    {/* Diagnosis - structured for service provider */}
                    <section className="space-y-6">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold text-foreground">Job Summary</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Overview of the reported issue, required service, and recommended next steps for the customer.
                            </p>
                        </div>
                        <div className="grid gap-6">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">Job Type</p>
                                <p className="text-sm font-medium text-foreground">{diag?.diagnosis || 'Not specified'}</p>
                            </div>
                            {diag?.action_required && diag.action_required !== 'N/A' && (
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">Recommended Action</p>
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                        {sanitizeAiContent(diag.action_required)}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    <Separator />

                    {/* Images - main first, then additional */}
                    <section className="space-y-4">
                        <h2 className="text-lg font-semibold text-foreground">Photos</h2>
                        {allImages.length > 0 ? (
                            <>
                                {mainImage && (
                                    <div className="rounded-lg border border-border overflow-hidden relative">
                                        <img
                                            src={mainImage}
                                            alt="Main"
                                            className="w-full object-cover max-h-[400px]"
                                        />
                                        <Badge variant="default" className="absolute bottom-2 right-2">{diag.trade}</Badge>
                                    </div>
                                )}
                                {additionalImages.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {additionalImages.map((url, i) => {
                                            const label = `Additional ${i + 1}`;
                                            return (
                                                <div key={i} className="rounded-lg border border-border overflow-hidden aspect-square relative">
                                                    <img
                                                        src={url}
                                                        alt={label}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <Badge variant="secondary" className="absolute bottom-2 right-2">
                                                        {label}
                                                    </Badge>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">No photos</p>
                        )}
                    </section>

                    <Separator />

                    {/* Scandio signup - styled like chat page */}
                    <section className="space-y-6">
                        <div className="space-y-1">
                            <h4 className="text-lg font-semibold text-foreground">
                                Get Home Maintenance Leads
                            </h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Scandio helps homeowners find trusted home service providers. We're listing and promoting Western Cape providers for free until September 2026.
                            </p>
                        </div>
                        {signupSuccess ? (
                            <p className="text-sm text-muted-foreground text-center">
                                Thank you for your interest in Scandio. We'll be in touch with more information soon.
                            </p>
                        ) : (
                            <form onSubmit={handleSignup} className="flex flex-col gap-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label htmlFor="company" className="text-sm font-medium text-foreground block">
                                            Company Name
                                        </label>
                                        <Input
                                            id="company"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            required
                                            className="bg-background text-base sm:text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="email" className="text-sm font-medium text-foreground block">
                                            Email Address
                                        </label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="bg-background text-base sm:text-smtext-[14px] "
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label htmlFor="team_size" className="text-sm font-medium text-foreground block">
                                            Team Size
                                        </label>
                                        <Select value={teamSize || undefined} onValueChange={setTeamSize}>
                                            <SelectTrigger id="team_size" className="w-full bg-background text-base sm:text-sm text-[14px] py-0">
                                                <SelectValue placeholder="Select Team Size" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1–5">1–5</SelectItem>
                                                <SelectItem value="6–20">6–20</SelectItem>
                                                <SelectItem value="21–50">21–50</SelectItem>
                                                <SelectItem value="50+">50+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="spend_per_month" className="text-sm font-medium text-foreground block">
                                            Monthly Marketing Budget
                                        </label>
                                        <Select value={spendPerMonth || undefined} onValueChange={setSpendPerMonth}>
                                            <SelectTrigger id="spend_per_month" className="w-full bg-background text-base sm:text-sm text-[14px] py-0">
                                                <SelectValue placeholder="Select Budget" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="R100">R100</SelectItem>
                                                <SelectItem value="R500">R500</SelectItem>
                                                <SelectItem value="R1000">R1,000</SelectItem>
                                                <SelectItem value="R1000+">R1,000+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="descriptive" className="text-sm font-medium text-foreground block">
                                        Describe Your Business
                                    </label>
                                    <Textarea
                                        id="descriptive"
                                        value={descriptiveText}
                                        onChange={(e) => setDescriptiveText(e.target.value)}
                                        rows={4}
                                        className="bg-background resize-none text-base sm:text-sm text-[14px]"
                                    />
                                </div>
                                <Button type="submit" disabled={signupSubmitting}>
                                    {signupSubmitting ? 'Submitting…' : 'Register'}
                                </Button>
                            </form>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}

export default function ReportPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen w-full items-center justify-center bg-background">
                    <Spinner className="size-8 text-muted-foreground" />
                </div>
            }
        >
            <ReportContent />
        </Suspense>
    );
}
