'use client';

import { toast } from 'sonner';
import { toWhatsAppPhone } from '@/lib/utils';
import { resolveWhatsAppPrefill } from '@/lib/whatsapp-prefill';
import { CONSENT_TEXT_VERSION } from '@/components/contact-consent-dialog';
import type { MatchProvider } from '@/features/match/contracts';

export type ContactChannel = 'whatsapp' | 'phone' | 'email';
export type ConsentMode = 'ask_each_time' | 'always_share';

export type PendingContact = {
    provider: MatchProvider;
    channel: ContactChannel;
};

// --- Contact channel actions (run only after the gate passes) ---------------
export async function openWhatsAppChannel(provider: MatchProvider): Promise<void> {
    const waPhone = toWhatsAppPhone(provider.phone);
    if (!waPhone) return;
    const profileUrl = provider.providerId
        ? `${window.location.origin}/pro/${provider.providerId}`
        : window.location.href;
    const prefill = await resolveWhatsAppPrefill(profileUrl);
    let text = [
        `Hi${provider.name ? ` ${provider.name}` : ''}, I found you on Mendr.`,
        prefill.diagnosis && prefill.diagnosis !== 'Home repair or maintenance'
            ? `Mendr diagnosed my issue: ${prefill.diagnosis}.`
            : `I have a home repair issue I'd like your help with.`,
        prefill.report_url
            ? `You can view my full Mendr report here: ${prefill.report_url}`
            : '',
        `Are you available to assist?`,
    ]
        .filter(Boolean)
        .join('\n\n');
    try {
        const res = await fetch('/api/whatsapp-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                diagnosis: prefill.diagnosis,
                provider_name: provider.name,
                trade: prefill.trade,
                report_url: prefill.report_url,
                profile_url: prefill.profile_url,
            }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (res.ok && data.message?.trim()) text = data.message.trim();
    } catch {
        // Keep the template fallback.
    }
    window.open(
        `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
    );
}

export function openPhoneChannel(provider: MatchProvider): void {
    if (provider.phone) window.location.href = `tel:${provider.phone}`;
}

export function openEmailChannel(provider: MatchProvider): void {
    if (provider.website) window.location.href = `mailto:${provider.website}`;
}

export type ExecuteContactDeps = {
    conversationId: string;
    trackContactIntent: (channel: ContactChannel) => void;
};

// Records the identified lead + consent, then opens the channel. Best-effort
// recording — a failure must never block the homeowner contacting.
export async function executeContact(
    provider: MatchProvider,
    channel: ContactChannel,
    deps: ExecuteContactDeps
): Promise<void> {
    const { conversationId, trackContactIntent } = deps;
    trackContactIntent(channel);
    if (provider.providerId && conversationId) {
        try {
            await fetch('/api/contact/contractor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: provider.providerId,
                    diagnosisId: conversationId,
                    channel,
                    consentTextVersion: CONSENT_TEXT_VERSION,
                }),
            });
        } catch {
            // Non-fatal — proceed to the channel regardless.
        }
    }
    if (channel === 'whatsapp') await openWhatsAppChannel(provider);
    else if (channel === 'phone') openPhoneChannel(provider);
    else openEmailChannel(provider);
}

export type BeginContactDeps = ExecuteContactDeps & {
    user: unknown;
    router: { push: (href: string) => void };
    consentMode: ConsentMode | null;
    setConsentMode: (mode: ConsentMode) => void;
    setPendingContact: (pending: PendingContact | null) => void;
    setAuthOpen: (open: boolean) => void;
    setConsentOpen: (open: boolean) => void;
};

// The gate: sign in -> captured number -> consent, then contact.
export async function beginContact(
    provider: MatchProvider,
    channel: ContactChannel,
    deps: BeginContactDeps
): Promise<void> {
    const { user, router, setConsentMode, setPendingContact, setAuthOpen, setConsentOpen } = deps;
    if (!user) {
        setPendingContact({ provider, channel });
        setAuthOpen(true);
        return;
    }
    // A captured number is required so the lead is identified.
    try {
        const res = await fetch('/api/account/phone');
        const data = (await res.json().catch(() => ({}))) as { phone?: string | null };
        if (!data.phone) {
            toast.info('Add your mobile number so specialists can reach you.');
            router.push('/onboarding');
            return;
        }
    } catch {
        // If the check itself fails, do not hard-block the contact.
    }
    let mode = deps.consentMode;
    if (mode == null) {
        try {
            const res = await fetch('/api/account/consent-settings');
            const data = (await res.json().catch(() => ({}))) as {
                mode?: ConsentMode;
            };
            mode = data.mode ?? 'ask_each_time';
            setConsentMode(mode);
        } catch {
            mode = 'ask_each_time';
        }
    }
    if (mode === 'always_share') {
        void executeContact(provider, channel, deps);
        return;
    }
    setPendingContact({ provider, channel });
    setConsentOpen(true);
}

export type ConsentConfirmDeps = ExecuteContactDeps & {
    pendingContact: PendingContact | null;
    setConsentMode: (mode: ConsentMode) => void;
    setContactBusy: (busy: boolean) => void;
    setConsentOpen: (open: boolean) => void;
    setPendingContact: (pending: PendingContact | null) => void;
};

export async function confirmConsentAndContact(
    dontAskAgain: boolean,
    deps: ConsentConfirmDeps
): Promise<void> {
    const { pendingContact, setConsentMode, setContactBusy, setConsentOpen, setPendingContact } =
        deps;
    if (!pendingContact) return;
    setContactBusy(true);
    try {
        if (dontAskAgain) {
            setConsentMode('always_share');
            void fetch('/api/account/consent-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'always_share' }),
            }).catch(() => {});
        }
        await executeContact(pendingContact.provider, pendingContact.channel, deps);
    } finally {
        setContactBusy(false);
        setConsentOpen(false);
        setPendingContact(null);
    }
}
