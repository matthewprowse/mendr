'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import type { ConsentMode, PendingContact } from '@/app/match/components/contact-actions';

/**
 * Contact gate (Phase 2): logged-in + captured number + consent before any
 * WhatsApp/Call/Email action. The lead and shared identity are written at
 * the moment of consent, before any message is sent.
 */
export function useContactFlowState() {
    const [contactOpen, setContactOpen] = useState(false);
    const { user } = useAuth();
    const [authOpen, setAuthOpen] = useState(false);
    const [consentOpen, setConsentOpen] = useState(false);
    const [contactBusy, setContactBusy] = useState(false);
    const [consentMode, setConsentMode] = useState<ConsentMode | null>(null);
    const [pendingContact, setPendingContact] = useState<PendingContact | null>(null);

    return {
        contactOpen,
        setContactOpen,
        user,
        authOpen,
        setAuthOpen,
        consentOpen,
        setConsentOpen,
        contactBusy,
        setContactBusy,
        consentMode,
        setConsentMode,
        pendingContact,
        setPendingContact,
    };
}
