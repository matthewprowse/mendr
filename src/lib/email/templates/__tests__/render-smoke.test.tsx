/**
 * Render smoke tests for every email template in src/lib/email/templates.
 *
 * Templates render at send time, so a broken one fails silently in
 * production, per recipient. Each case proves: (1) @react-email/render
 * produces non-empty HTML, (2) key dynamic props appear in that HTML, and
 * (3) the plain-text twin includes the same key content.
 *
 * When adding a template, add a case to TEMPLATES below — the suite fails
 * with a reminder if a file in templates/ has no case.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render } from '@react-email/render';

import { MendrAuthEmail, authEmailText } from '../auth';
import {
    ContractorApplicationReceivedEmail,
    contractorApplicationReceivedText,
} from '../contractor-application-received';
import { ContractorApprovedEmail, contractorApprovedText } from '../contractor-approved';
import {
    ContractorOnboardingDay3Email,
    contractorOnboardingDay3Text,
} from '../contractor-onboarding-day3';
import {
    ContractorOnboardingDay7Email,
    contractorOnboardingDay7Text,
} from '../contractor-onboarding-day7';
import { ContractorOutreachEmail, contractorOutreachText } from '../contractor-outreach';
import { ContractorWelcomeEmail, contractorWelcomeText } from '../contractor-welcome';
import { DiagnosisReadyEmail, diagnosisReadyText } from '../diagnosis-ready';
import { FeatureAnnouncementEmail, featureAnnouncementText } from '../feature-announcement';
import { FoundingMemberNudgeEmail, foundingMemberNudgeText } from '../founding-member-nudge';
import {
    HomeownerReengagementEmail,
    homeownerReengagementText,
} from '../homeowner-reengagement';
import { HomeownerWelcomeEmail, homeownerWelcomeText } from '../homeowner-welcome';
import { MonthlyDigestReactEmail, monthlyDigestReactText } from '../monthly-digest-react';
import {
    NewLeadNotificationEmail,
    newLeadNotificationText,
} from '../new-lead-notification';
import {
    PostDiagnosisFollowupEmail,
    postDiagnosisFollowupText,
} from '../post-diagnosis-followup';
import { RatingRequestEmail, ratingRequestText } from '../rating-request';
import {
    WaitlistNotificationEmail,
    waitlistNotificationText,
} from '../waitlist-notification';

const UNSUB = 'https://mendr.test/unsubscribe?u=abc';

interface TemplateCase {
    /** templates/ filename this case covers (drift guard). */
    file: string;
    component: React.ReactElement;
    text: string;
    /** Substrings that must appear in BOTH the HTML and the text version. */
    mustContain: string[];
}

const TEMPLATES: TemplateCase[] = [
    {
        file: 'auth.tsx',
        component: React.createElement(MendrAuthEmail, {
            preview: 'Your sign-in code',
            heading: 'Sign in to Mendr',
            body: 'Use the code below to sign in.',
            otp: '482913',
        }),
        text: authEmailText({
            preview: 'Your sign-in code',
            heading: 'Sign in to Mendr',
            body: 'Use the code below to sign in.',
            otp: '482913',
        }),
        mustContain: ['482913'],
    },
    {
        file: 'contractor-application-received.tsx',
        component: React.createElement(ContractorApplicationReceivedEmail, {
            firstName: 'Sipho',
            businessName: 'Dlamini Plumbing',
        }),
        // NOTE: unlike every other template, this text fn takes positional args.
        text: contractorApplicationReceivedText('Sipho', 'Dlamini Plumbing'),
        mustContain: ['Sipho', 'Dlamini Plumbing'],
    },
    {
        file: 'contractor-approved.tsx',
        component: React.createElement(ContractorApprovedEmail, {
            firstName: 'Sipho',
            geminiSummary: 'A reliable plumbing outfit serving the southern suburbs.',
            editUrl: 'https://mendr.test/pro/profile/edit',
        }),
        // NOTE: positional args here too — see contractor-application-received.
        text: contractorApprovedText(
            'Sipho',
            'A reliable plumbing outfit serving the southern suburbs.',
            'https://mendr.test/pro/profile/edit',
        ),
        mustContain: ['Sipho', 'https://mendr.test/pro/profile/edit'],
    },
    {
        file: 'contractor-onboarding-day3.tsx',
        component: React.createElement(ContractorOnboardingDay3Email, {
            firstName: 'Sipho',
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        text: contractorOnboardingDay3Text({
            firstName: 'Sipho',
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Sipho', 'https://mendr.test/pro/profile'],
    },
    {
        file: 'contractor-onboarding-day7.tsx',
        component: React.createElement(ContractorOnboardingDay7Email, {
            firstName: 'Sipho',
            leadsUrl: 'https://mendr.test/pro/leads',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        text: contractorOnboardingDay7Text({
            firstName: 'Sipho',
            leadsUrl: 'https://mendr.test/pro/leads',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Sipho', 'https://mendr.test/pro/leads'],
    },
    {
        file: 'contractor-outreach.tsx',
        component: React.createElement(ContractorOutreachEmail, {
            businessName: 'Dlamini Plumbing',
            contactCount: 7,
            tradeType: 'Plumbing',
            month: 'May 2026',
            applyUrl: 'https://mendr.test/pro/network',
            unsubscribeUrl: UNSUB,
        }),
        text: contractorOutreachText({
            businessName: 'Dlamini Plumbing',
            contactCount: 7,
            tradeType: 'Plumbing',
            month: 'May 2026',
            applyUrl: 'https://mendr.test/pro/network',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Dlamini Plumbing', 'May 2026'],
    },
    {
        file: 'contractor-welcome.tsx',
        component: React.createElement(ContractorWelcomeEmail, {
            firstName: 'Sipho',
            businessName: 'Dlamini Plumbing',
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        text: contractorWelcomeText({
            firstName: 'Sipho',
            businessName: 'Dlamini Plumbing',
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Sipho', 'Dlamini Plumbing'],
    },
    {
        file: 'diagnosis-ready.tsx',
        component: React.createElement(DiagnosisReadyEmail, {
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Penetrating damp — roof flashing failure',
            urgency: 'moderate',
            estimatedCost: 'R2,400–R4,000',
            tradeCategory: 'Waterproofing',
            suburb: 'Observatory',
        }),
        text: diagnosisReadyText({
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Penetrating damp — roof flashing failure',
            urgency: 'moderate',
            estimatedCost: 'R2,400–R4,000',
            tradeCategory: 'Waterproofing',
            suburb: 'Observatory',
        }),
        mustContain: ['https://mendr.test/report/abc'],
    },
    {
        file: 'feature-announcement.tsx',
        component: React.createElement(FeatureAnnouncementEmail, {
            title: 'Cost estimates',
            summary: 'See likely repair costs on every report.',
            url: 'https://mendr.test/new/cost-estimates',
            unsubscribeUrl: UNSUB,
        }),
        text: featureAnnouncementText({
            title: 'Cost estimates',
            summary: 'See likely repair costs on every report.',
            url: 'https://mendr.test/new/cost-estimates',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Cost estimates', 'https://mendr.test/new/cost-estimates'],
    },
    {
        file: 'founding-member-nudge.tsx',
        component: React.createElement(FoundingMemberNudgeEmail, {
            firstName: 'Sipho',
            spotsRemaining: 12,
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        text: foundingMemberNudgeText({
            firstName: 'Sipho',
            spotsRemaining: 12,
            profileUrl: 'https://mendr.test/pro/profile',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Sipho', '12'],
    },
    {
        file: 'homeowner-reengagement.tsx',
        component: React.createElement(HomeownerReengagementEmail, {
            diagnosisCount: 3,
            lastFaultTitle: 'Leaking geyser valve',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        text: homeownerReengagementText({
            diagnosisCount: 3,
            lastFaultTitle: 'Leaking geyser valve',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Leaking geyser valve'],
    },
    {
        file: 'homeowner-welcome.tsx',
        component: React.createElement(HomeownerWelcomeEmail, {
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Leaking geyser valve',
            suburb: 'Observatory',
            unsubscribeUrl: UNSUB,
        }),
        text: homeownerWelcomeText({
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Leaking geyser valve',
            suburb: 'Observatory',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Leaking geyser valve', 'https://mendr.test/report/abc'],
    },
    {
        file: 'monthly-digest-react.tsx',
        component: React.createElement(MonthlyDigestReactEmail, {
            businessName: 'Dlamini Plumbing',
            contactCount: 5,
            tradeTypes: ['Plumbing', 'Waterproofing'],
            month: 'May 2026',
            isRegistered: true,
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        text: monthlyDigestReactText({
            businessName: 'Dlamini Plumbing',
            contactCount: 5,
            tradeTypes: ['Plumbing', 'Waterproofing'],
            month: 'May 2026',
            isRegistered: true,
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Dlamini Plumbing', 'May 2026'],
    },
    {
        file: 'new-lead-notification.tsx',
        component: React.createElement(NewLeadNotificationEmail, {
            contractorFirstName: 'Sipho',
            homeownerSuburb: 'Observatory',
            faultTitle: 'Leaking geyser valve',
            faultCategory: 'Plumbing',
            urgency: 'high',
            estimatedCost: 'R800–R1,500',
            leadUrl: 'https://mendr.test/pro/leads/123',
            unsubscribeUrl: UNSUB,
            whatsappUrl: 'https://wa.me/27820000000',
        }),
        text: newLeadNotificationText({
            contractorFirstName: 'Sipho',
            homeownerSuburb: 'Observatory',
            faultTitle: 'Leaking geyser valve',
            faultCategory: 'Plumbing',
            urgency: 'high',
            estimatedCost: 'R800–R1,500',
            leadUrl: 'https://mendr.test/pro/leads/123',
            unsubscribeUrl: UNSUB,
            whatsappUrl: 'https://wa.me/27820000000',
        }),
        mustContain: ['Observatory', 'https://mendr.test/pro/leads/123'],
    },
    {
        file: 'post-diagnosis-followup.tsx',
        component: React.createElement(PostDiagnosisFollowupEmail, {
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Leaking geyser valve',
            urgency: 'moderate',
            contractorsUrl: 'https://mendr.test/match/abc',
            unsubscribeUrl: UNSUB,
        }),
        text: postDiagnosisFollowupText({
            reportUrl: 'https://mendr.test/report/abc',
            faultTitle: 'Leaking geyser valve',
            urgency: 'moderate',
            contractorsUrl: 'https://mendr.test/match/abc',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Leaking geyser valve'],
    },
    {
        file: 'rating-request.tsx',
        component: React.createElement(RatingRequestEmail, {
            providerName: 'Dlamini Plumbing',
            ratingBaseUrl: 'https://mendr.test/rate/abc?stars=',
            unsubscribeUrl: UNSUB,
        }),
        text: ratingRequestText({
            providerName: 'Dlamini Plumbing',
            ratingBaseUrl: 'https://mendr.test/rate/abc?stars=',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Dlamini Plumbing'],
    },
    {
        file: 'waitlist-notification.tsx',
        component: React.createElement(WaitlistNotificationEmail, {
            suburb: 'Observatory',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        text: waitlistNotificationText({
            suburb: 'Observatory',
            siteUrl: 'https://mendr.test',
            unsubscribeUrl: UNSUB,
        }),
        mustContain: ['Observatory'],
    },
];

describe('email templates — render smoke', () => {
    it('has a case for every file in templates/', () => {
        const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '..');
        const files = readdirSync(templatesDir).filter((f) => f.endsWith('.tsx'));
        const covered = new Set(TEMPLATES.map((t) => t.file));
        const missing = files.filter((f) => !covered.has(f));
        expect(
            missing,
            `New template(s) without a render smoke test: ${missing.join(', ')} — add a case to TEMPLATES.`,
        ).toEqual([]);
    });

    it.each(TEMPLATES.map((t) => [t.file, t] as const))(
        '%s renders to HTML containing its key content',
        async (_file, t) => {
            const html = await render(t.component);
            expect(html.length).toBeGreaterThan(200);
            expect(html).toContain('<html');
            for (const needle of t.mustContain) {
                expect(html).toContain(needle);
            }
        },
    );

    it.each(TEMPLATES.map((t) => [t.file, t] as const))(
        '%s has a plain-text twin containing the same key content',
        (_file, t) => {
            expect(t.text.trim().length).toBeGreaterThan(20);
            for (const needle of t.mustContain) {
                expect(t.text).toContain(needle);
            }
        },
    );
});
