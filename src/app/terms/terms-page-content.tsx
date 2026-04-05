import Link from 'next/link';
import { LEGAL_DETAILS_UNPUBLISHED, type SiteLegalConfig } from '@/lib/site-legal';
import {
    LegalFlowDocument,
    LegalFlowIntro,
    LegalFlowSection,
    LegalFlowSections,
    LegalFlowSubsection,
    LegalFlowSubsections,
} from '@/components/legal-flow-layout';

function EmailOrText({ value }: { value: string }) {
    if (value.includes('@') && !value.includes(' ')) {
        return (
            <a
                href={`mailto:${value}`}
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
                {value}
            </a>
        );
    }
    return <span className="text-muted-foreground">{value}</span>;
}

export function TermsPageContent({ c }: { c: SiteLegalConfig }) {
    return (
        <LegalFlowDocument>
            <LegalFlowIntro>
            <p className="text-muted-foreground">
                These Terms of Service (&quot;Terms&quot;) govern your access to and use of Scandio,
                including our website, web application, and related services (collectively, the
                &quot;Service&quot;). The Service is operated from and targeted primarily at users
                in South Africa, in particular homeowners and contractors in regions we describe in
                our marketing (for example, the Western Cape).
            </p>
            <p>
                By accessing or using the Service, you agree to these Terms. If you do not agree, do
                not use the Service.
            </p>
            <p>
                <strong className="font-semibold text-foreground">Important:</strong> Scandio
                provides <strong className="font-semibold text-foreground">information technology and information services</strong>. It does <strong className="font-semibold text-foreground">not</strong> replace licensed inspections, statutory compliance, or professional advice where required by South African law (for example, electrical compliance certificates, structural engineering, or municipal bylaws).{' '}
                <strong className="font-semibold text-foreground">
                    You use AI-assisted outputs at your own risk
                </strong>{' '}
                and should verify critical matters with qualified on-site professionals.
            </p>
            <p>
                <strong className="font-semibold text-foreground">These Terms are not legal advice.</strong>{' '}
                They are drafted for a South African context, including reference to the{' '}
                <strong className="font-semibold text-foreground">
                    Electronic Communications and Transactions Act 25 of 2002 (ECTA)
                </strong>{' '}
                and the{' '}
                <strong className="font-semibold text-foreground">
                    Consumer Protection Act 68 of 2008 (CPA)
                </strong>{' '}
                where relevant. A qualified attorney should review them before you rely on them as
                binding. If you are a <strong className="font-semibold text-foreground">consumer</strong> under the CPA, certain rights may not be excluded and nothing in these Terms is intended to defeat those rights.
            </p>
            </LegalFlowIntro>
            <LegalFlowSections>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Who We Are (Supplier Information: ECTA)
            </h2>
            <p>
                In line with <strong className="font-semibold text-foreground">section 43</strong> of
                ECTA (information to be disclosed by suppliers offering goods or services through
                electronic transactions), we disclose the following:
            </p>
            <div className="overflow-x-auto rounded-lg border border-input bg-card">
                <table className="w-full min-w-[280px] border-collapse text-left text-xs">
                    <thead>
                        <tr className="border-b border-input bg-secondary/60">
                            <th className="px-3 py-2.5 font-medium text-foreground">Item</th>
                            <th className="px-3 py-2.5 font-medium text-foreground">Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">
                                Full name / legal status
                            </td>
                            <td className="px-3 py-2">
                                {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED ? (
                                    <>
                                        Scandio (Pty) Ltd — {c.legalForm}{' '}
                                        <span className="italic text-muted-foreground">
                                            (placeholder — insert registered company name before
                                            launch)
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        {c.operatorLegalName} — {c.legalForm}
                                    </>
                                )}
                            </td>
                        </tr>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">
                                Physical address
                            </td>
                            <td className="px-3 py-2">
                                {c.physicalAddress === LEGAL_DETAILS_UNPUBLISHED ? (
                                    <>
                                        Cape Town, Western Cape, South Africa{' '}
                                        <span className="italic text-muted-foreground">
                                            (placeholder — insert registered address before launch)
                                        </span>
                                    </>
                                ) : (
                                    c.physicalAddress
                                )}
                            </td>
                        </tr>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">
                                Postal address
                            </td>
                            <td className="px-3 py-2">
                                {c.postalAddress === LEGAL_DETAILS_UNPUBLISHED ? (
                                    <>
                                        Same as physical address{' '}
                                        <span className="italic text-muted-foreground">
                                            (placeholder — insert if different)
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        {c.postalAddress}
                                        {c.postalAddress === 'Same as physical address' && (
                                            <span className="italic text-muted-foreground">
                                                {' '}
                                                (placeholder — insert if different)
                                            </span>
                                        )}
                                    </>
                                )}
                            </td>
                        </tr>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">Website</td>
                            <td className="px-3 py-2">
                                <a
                                    href={c.siteUrl}
                                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                                >
                                    {c.siteUrl}
                                </a>
                            </td>
                        </tr>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">Email / contact</td>
                            <td className="px-3 py-2">
                                {c.legalEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                                    <>
                                        <span className="text-muted-foreground">legal@scandio.app</span>{' '}
                                        <span className="italic text-muted-foreground">
                                            (placeholder — confirm before launch)
                                        </span>
                                    </>
                                ) : (
                                    <EmailOrText value={c.legalEmail} />
                                )}
                            </td>
                        </tr>
                        <tr className="border-b border-input">
                            <td className="px-3 py-2 font-medium text-foreground">
                                Description of services
                            </td>
                            <td className="px-3 py-2">
                                AI-assisted home maintenance insights, reports, and provider discovery
                                tools connecting users with independent contractors and businesses
                                listed or indexed via the Service.
                            </td>
                        </tr>
                        <tr>
                            <td className="px-3 py-2 font-medium text-foreground">Privacy policy</td>
                            <td className="px-3 py-2">
                                See our{' '}
                                <Link
                                    href="/privacy"
                                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                                >
                                    Privacy Policy
                                </Link>
                                .
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="text-xs italic text-muted-foreground">
                If any of the above details are not yet completed on the public site, they will be
                completed before we rely on these Terms in a commercial context.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Eligibility and Accounts
            </h2>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>You must be at least 18 years old to use the Service.</li>
                <li>
                    You may use certain features without a full account; we may still create
                    technical identifiers (for example, anonymous authentication or session records)
                    as described in our{' '}
                    <Link
                        href="/privacy"
                        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        Privacy Policy
                    </Link>
                    .
                </li>
                <li>
                    If you register, you must provide accurate information and keep your credentials
                    confidential. You are responsible for activity under your account unless you
                    notify us of unauthorised use without undue delay.
                </li>
                <li>
                    We may offer sign-in via third-party providers (for example, OAuth). Their terms
                    and privacy policies also apply to that authentication step.
                </li>
            </ul>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                The Service (What Scandio Does and Does Not Do)
            </h2>
            <LegalFlowSubsections>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Nature of the Service</h3>
            <p>Scandio may include:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>Upload and analysis of images and text you provide;</li>
                <li>
                    AI-generated summaries, classifications, or suggestions concerning possible
                    maintenance or repair issues;
                </li>
                <li>
                    Provider search, ranking, maps, and business profiles drawn from our database
                    and third-party sources;
                </li>
                <li>
                    Tools to contact independent businesses (for example, phone, email, WhatsApp) or
                    to prepare messages;
                </li>
                <li>Reviews, reports, and shareable links as implemented in the product.</li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Not Professional Services</h3>
            <p>
                Scandio does not perform on-site work, issue compliance certificates, or warrant
                that any contractor is suitable, licensed, or available. Contractors are independent
                third parties. Any agreement for work is between you and the contractor unless we
                explicitly state otherwise in a separate written agreement.
            </p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">AI Limitations</h3>
            <p>
                Outputs may be incorrect, incomplete, or not applicable to your situation. AI can
                produce errors or misread images. You agree to:
            </p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>Use outputs as general information only;</li>
                <li>
                    Verify safety-critical, regulatory, or high-value decisions with qualified
                    humans;
                </li>
                <li>
                    Not rely on Scandio as the sole basis for decisions that could affect health,
                    safety, or significant property value.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Geographic Focus</h3>
            <p>
                Features (for example, provider coverage or regional filters) may be limited to
                certain areas. We do not guarantee nationwide or continuous coverage.
            </p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Changes and Availability</h3>
            <p>
                We may modify, suspend, or discontinue any part of the Service (including quotas or
                rate limits) with or without notice. We aim for reasonable uptime but do not
                guarantee uninterrupted access.
            </p>
            </LegalFlowSubsection>
            </LegalFlowSubsections>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Violate any applicable South African law (including POPIA, the Cybercrimes Act 19
                    of 2020, copyright, and defamation law) or third-party rights;
                </li>
                <li>Upload unlawful, harmful, harassing, discriminatory, or obscene content;</li>
                <li>
                    Attempt to probe, scan, or test the vulnerability of the Service, bypass
                    authentication, or circumvent rate limits, quotas, or security controls;
                </li>
                <li>
                    Use automated means (bots, scrapers) to extract data at scale without our written
                    consent;
                </li>
                <li>
                    Misrepresent your identity or affiliation, or manipulate reviews or rankings;
                </li>
                <li>
                    Upload images of people without their consent where that would violate POPIA or
                    other law, or upload images you do not have the right to use;
                </li>
                <li>Use the Service to transmit malware or interfere with other users.</li>
            </ul>
            <p>
                We may investigate violations and cooperate with law enforcement or regulators,
                including the South African Police Service or the Information Regulator, where
                required.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                User Content and Licence
            </h2>
            <p>
                You retain ownership of content you submit. You grant us a worldwide, non-exclusive,
                royalty-free licence to host, store, reproduce, adapt, display, and process your
                content solely to operate, improve, secure, and promote the Service (including
                training or tuning only where permitted by our Privacy Policy and applicable law).
            </p>
            <p>
                You represent that you have the rights needed to grant this licence. We may remove
                content that violates these Terms or law.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Provider Listings, Reviews, and Third-Party Data
            </h2>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Listings may include data from public directories, Google Places, or similar
                    sources, and from contractor applications. While we aim for accuracy, we do not
                    warrant that listings are complete, current, or error-free.
                </li>
                <li>
                    Reviews may be moderated. We may remove reviews that we reasonably believe are
                    fake, defamatory, or violate these Terms.
                </li>
                <li>Star ratings or metrics from third parties are provided for convenience only.</li>
            </ul>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Fees</h2>
            <p>
                If we charge fees for specific features, we will disclose pricing, billing cycle, and
                payment method before you commit, consistent with ECTA and CPA norms for electronic
                transactions. Unless stated, the Service may be offered free of charge for certain
                tiers, subject to fair use and quotas.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Consumer Rights (CPA)
            </h2>
            <p>
                If you are a consumer as defined in the CPA and the CPA applies to a transaction with
                us, you may have rights that cannot lawfully be excluded (for example, rights
                relating to fair and honest dealing or certain remedies for defective services).
                Nothing in these Terms is intended to exclude those rights. For CPA-related
                complaints, you may also contact the National Consumer Commission or other
                applicable ombud schemes where relevant.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Disclaimer of Warranties
            </h2>
            <p>
                To the fullest extent permitted by South African law, the Service is provided
                &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
                whether express, implied, or statutory, including merchantability, fitness for a
                particular purpose, or non-infringement.
            </p>
            <p>We do not warrant that:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>AI outputs will be accurate or suitable for your situation;</li>
                <li>
                    Any contractor will be available, licensed in a particular category, or perform
                    work to a given standard;
                </li>
                <li>The Service will be error-free or continuously available.</li>
            </ul>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Limitation of Liability
            </h2>
            <p>To the fullest extent permitted by law:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    We exclude liability for indirect, consequential, or punitive damages, loss of
                    profit, loss of data, or business interruption, except where such exclusion is
                    unlawful; and
                </li>
                <li>
                    Our aggregate liability arising out of or relating to the Service in any
                    12-month period is limited to the greater of (a) the amount you paid us for the
                    Service in that period or (b) R500, except where liability cannot be limited
                    under the CPA, ECTA, or other law.
                </li>
            </ul>
            <p>
                Nothing in these Terms limits liability for death or personal injury caused by gross
                negligence or wilful misconduct, or other liability that cannot be excluded by law.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Indemnity</h2>
            <p>
                You agree to indemnify and hold harmless{' '}
                {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        Scandio (Pty) Ltd
                        <span className="italic text-muted-foreground">
                            {' '}
                            (placeholder — insert registered company name before launch)
                        </span>
                    </>
                ) : (
                    c.operatorLegalName
                )}
                , its directors, employees, and agents against claims, damages, losses, and costs
                (including reasonable legal fees) arising from your use of the Service, your content,
                or your breach of these Terms, except to the extent caused by our gross negligence or
                wilful misconduct.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Suspension and Termination
            </h2>
            <p>
                We may suspend or terminate your access if you breach these Terms, if we must comply
                with law, or if we discontinue the Service. You may stop using the Service at any
                time. Provisions that by nature should survive (including intellectual property,
                disclaimers, limitation of liability, governing law) will survive termination.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Electronic Communications
            </h2>
            <p>
                You consent to receive notices and agreements electronically (including by email or
                in-app). This satisfies ECTA requirements for electronic communications where
                applicable.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Governing Law and Jurisdiction
            </h2>
            <p>
                These Terms are governed by the laws of the Republic of South Africa. Subject to
                mandatory consumer protections and other non-excludable rules, you agree to the
                exclusive jurisdiction of the courts of South Africa (for example, the High Court of
                South Africa or Magistrates&apos; Courts with competent jurisdiction, depending on
                claim type and rules).
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Dispute Resolution
            </h2>
            <p>
                We encourage you to contact us first via{' '}
                <Link
                    href="/contact"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    Contact on the Scandio website
                </Link>{' '}
                to resolve disputes. Where the CPA or industry ombud schemes apply, you may have
                additional alternative dispute resolution options.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Changes to These Terms
            </h2>
            <p>
                We may update these Terms. The &quot;Last updated&quot; date will change. If changes
                are material, we will provide reasonable notice where practicable. Continued use
                after the effective date may constitute acceptance. If you do not agree, you must
                stop using the Service.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p>
                <strong className="font-semibold text-foreground">
                    {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED
                        ? 'Scandio (Pty) Ltd'
                        : c.operatorLegalName}
                </strong>
                {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED && (
                    <span className="italic text-muted-foreground">
                        {' '}
                        (placeholder — insert registered company name before launch)
                    </span>
                )}
            </p>
            <p>
                {c.physicalAddress === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        Cape Town, Western Cape, South Africa{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — insert registered address before launch)
                        </span>
                    </>
                ) : (
                    c.physicalAddress
                )}
            </p>
            <p>
                <strong className="font-semibold text-foreground">Email:</strong>{' '}
                {c.legalEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        <span className="text-muted-foreground">legal@scandio.app</span>{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm before launch)
                        </span>
                    </>
                ) : (
                    <EmailOrText value={c.legalEmail} />
                )}
            </p>
            <p>
                <strong className="font-semibold text-foreground">Contact form:</strong>{' '}
                <Link
                    href="/contact"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    Contact on the Scandio website
                </Link>
            </p>

            <p className="text-xs italic text-muted-foreground">
                These Terms are intended for businesses operating in the South African digital economy
                and for consumers to whom the CPA may apply. They should be reviewed by a South African
                attorney before adoption as binding legal terms.
            </p>
            <p className="text-xs italic text-muted-foreground">
                Questions?{' '}
                <Link
                    href="/contact"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    Contact us
                </Link>
                . See also our{' '}
                <Link
                    href="/privacy"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    Privacy Policy
                </Link>
                .
            </p>
            </LegalFlowSection>
            </LegalFlowSections>
        </LegalFlowDocument>
    );
}
