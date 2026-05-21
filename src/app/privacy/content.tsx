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

export function PrivacyPageContent({ c }: { c: SiteLegalConfig }) {
    return (
        <LegalFlowDocument>
            <LegalFlowIntro>
            <div className="flex flex-col gap-2 rounded-lg border border-input bg-secondary/40 p-4 text-xs sm:text-sm">
                <p>
                    <strong className="font-semibold text-foreground">Responsible party (operator):</strong>{' '}
                    {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED ? (
                        <>
                            Menda (Pty) Ltd{' '}
                            <span className="italic text-muted-foreground">
                                (placeholder — insert registered company name before launch)
                            </span>
                        </>
                    ) : (
                        c.operatorLegalName
                    )}
                </p>
                <p>
                    <strong className="font-semibold text-foreground">
                        South African physical address:
                    </strong>{' '}
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
                    <strong className="font-semibold text-foreground">
                        General and privacy enquiries:
                    </strong>{' '}
                    {c.privacyEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                        <>
                            <span className="text-muted-foreground">privacy@menda.co.za</span>{' '}
                            <span className="italic text-muted-foreground">
                                (placeholder — confirm before launch)
                            </span>
                        </>
                    ) : (
                        <EmailOrText value={c.privacyEmail} />
                    )}
                    , or use the{' '}
                    <Link
                        href="/contact"
                        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        contact form
                    </Link>{' '}
                    on the Menda website
                </p>
                <p>
                    <strong className="font-semibold text-foreground">Website:</strong>{' '}
                    <a
                        href={c.siteUrl}
                        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        {c.siteUrl}
                    </a>
                </p>
            </div>

            <p>
                This Privacy Policy explains how we collect, use, store, disclose, and protect personal
                information when you use Menda, a South Africa-focused digital service that helps
                homeowners obtain AI-assisted maintenance insights and discover local service providers.
            </p>
            <p>
                We process personal information in line with the{' '}
                <strong className="font-semibold text-foreground">
                    Protection of Personal Information Act 4 of 2013 (POPIA)
                </strong>{' '}
                and related regulations (including amendments published from time to time). Nothing
                in this policy limits any right you have under POPIA or other applicable South
                African law.
            </p>
            <p>
                <strong className="font-semibold text-foreground">This policy is not legal advice.</strong>{' '}
                You should obtain independent legal advice if you need certainty for your own
                circumstances. If you are a business customer, your agreement with us may also
                contain additional or overriding provisions.
            </p>
            </LegalFlowIntro>
            <LegalFlowSections>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Who We Are</h2>
            <p>
                We are the <strong className="font-semibold text-foreground">responsible party</strong>{' '}
                (as defined in POPIA) in respect of personal information processed through Menda,
                unless we state otherwise (for example, where a processor acts strictly on our
                instructions).
            </p>
            <p>
                Where this policy refers to &quot;we&quot;, &quot;us&quot;, or &quot;Menda&quot;, it
                means{' '}
                {c.operatorLegalName === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>Menda (Pty) Ltd.</>
                ) : (
                    <>{c.operatorLegalName}.</>
                )}
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Information Officer (POPIA)
            </h2>
            <p>
                POPIA requires organisations to designate an Information Officer (and, where
                appropriate, deputy information officers) to assist with compliance.
            </p>
            <p>
                <strong className="font-semibold text-foreground">Information Officer:</strong>{' '}
                {c.informationOfficerName === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        Matthew Prowse{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm designation and register with Information
                            Regulator before launch)
                        </span>
                    </>
                ) : (
                    c.informationOfficerName
                )}
            </p>
            <p>
                <strong className="font-semibold text-foreground">Email:</strong>{' '}
                {c.privacyEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        <span className="text-muted-foreground">privacy@menda.co.za</span>{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm before launch)
                        </span>
                    </>
                ) : (
                    <EmailOrText value={c.privacyEmail} />
                )}
            </p>
            <p>
                The Information Officer must be registered with the Information Regulator of South
                Africa as required by law. If you interact with a deputy, we will confirm their
                authority when responding.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Scope</h2>
            <p>This policy applies to:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>Visitors to our website and web application;</li>
                <li>
                    Homeowners and other end users who upload content, use AI-assisted features,
                    search for providers, or contact us;
                </li>
                <li>
                    Contractors and businesses that apply to be listed or use contractor-facing
                    features; and
                </li>
                <li>
                    Anyone whose personal information we otherwise process in connection with
                    Menda.
                </li>
            </ul>
            <p>
                It does not apply to personal information processed solely by independent third parties
                (such as a contractor you contact directly outside Menda), except where we facilitate
                that processing as described below.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                What Personal Information We Collect
            </h2>
            <p>
                The nature and category of information depend on how you use Menda. It may include:
            </p>
            <LegalFlowSubsections>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Account and Identity Details
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Name and surname, email address, and similar registration details if you create
                    an account or sign in (including via third-party identity providers where
                    offered);
                </li>
                <li>Physical or service address if you choose to provide it;</li>
                <li>
                    Authentication and security-related data processed by our authentication
                    provider.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Diagnosis and Report Content
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>Photographs or other images you upload for analysis;</li>
                <li>
                    Text you enter in chat or forms (for example, descriptions of a fault or
                    property);
                </li>
                <li>
                    AI-generated outputs (such as diagnostic summaries or structured fields) produced
                    from your inputs;
                </li>
                <li>
                    Identifiers linking your activity to a conversation or report record in our
                    systems.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Location Information</h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Approximate or precise location where you allow it (for example, coordinates or an
                    address you enter or confirm for matching nearby providers).
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Technical, Usage, and Security Data
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Device type, browser or app user agent, and similar technical metadata we
                    associate with sessions;
                </li>
                <li>
                    Session and analytics identifiers (for example, a browser session identifier
                    stored in session storage and event identifiers used for product analytics);
                </li>
                <li>
                    Hashed IP data: for certain analytics events we derive a one-way hash from your IP
                    address. We do not store your full IP address in that analytics table in plain
                    text;
                </li>
                <li>
                    Cookies and similar technologies as described in the Cookies section below.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Contractor and Business Applicants
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Business name, trade, service areas, contact person, phone, email, website,
                    registration or certification details you submit;
                </li>
                <li>Application materials such as images or documents you upload;</li>
                <li>
                    Applicant IP address where our systems record it for security or abuse prevention
                    on specific submission endpoints.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Reviews and Feedback</h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Display name (as you provide it), review text, ratings, and related metadata when
                    you submit a review about a listed provider.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Support and Enquiries</h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Name, email, subject, and message content when you contact us via forms or email.
                </li>
            </ul>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Information From Third Parties
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Provider directory data from public or licensed sources (for example, business
                    listings and reviews aggregated from third-party services) shown on Menda. That
                    information may relate to juristic persons or to individuals (for example, sole
                    traders). Where it is personal information, we process it for legitimate business
                    purposes and in line with POPIA.
                </li>
            </ul>
            </LegalFlowSubsection>
            </LegalFlowSubsections>
            <p>
                We aim to collect only what is adequate, relevant, and not excessive for the
                purpose.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Why We Process Personal Information (Purposes)
            </h2>
            <p>We process personal information to:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Provide, operate, secure, and improve Menda (including AI-assisted diagnosis,
                    reporting, and provider matching);
                </li>
                <li>
                    Authenticate users, prevent fraud and abuse, and enforce rate limits and fair-use
                    rules;
                </li>
                <li>
                    Store and display content you submit (for example, your report or
                    contractor-facing profile elements);
                </li>
                <li>
                    Communicate with you about the service, support requests, or legal notices;
                </li>
                <li>
                    Conduct product analytics (for example, understanding funnel steps and feature
                    usage) using aggregated or pseudonymous data where possible;
                </li>
                <li>
                    Comply with law, regulatory requests, or court orders, and protect our rights and
                    those of users;
                </li>
                <li>
                    Resolve disputes and enforce our{' '}
                    <Link
                        href="/terms"
                        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        Terms of Service
                    </Link>
                    .
                </li>
            </ul>
            <p>
                We do <strong className="font-semibold text-foreground">not</strong> sell your
                personal information to data brokers.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Lawful Basis for Processing (POPIA)
            </h2>
            <p>
                POPIA requires processing to be lawful and to comply with eight conditions,
                including accountability, processing limitation, purpose specification, further
                processing limitation, information quality, openness, security safeguards, and data
                subject participation.
            </p>
            <p>Depending on the situation, we rely on one or more of the following grounds:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    <strong className="font-semibold text-foreground">Consent</strong> — where we ask
                    for consent (for example, optional communications or non-essential cookies where
                    consent is required). You may withdraw consent as described when we collect it or
                    by contacting us;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Performance of a contract</strong>{' '}
                    — steps at your request before entering a contract, or performance of our
                    agreement with you;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Legitimate interests</strong>{' '}
                    — for example, securing the platform, analytics that do not unduly impact your
                    privacy, or listing legitimate business information about contractors where
                    permitted;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Legal obligation</strong> —
                    where we must retain or disclose information to comply with South African law;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">
                        Protection of a legitimate interest
                    </strong>{' '}
                    — yours or ours, balanced against your rights (for example, safety and security
                    monitoring).
                </li>
            </ul>
            <p>
                Where POPIA requires consent and you refuse, we may not be able to provide certain
                features.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                How We Share Personal Information
            </h2>
            <LegalFlowSubsections>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">
                Service Providers (Processors)
            </h3>
            <p>Categories of recipients include:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    Cloud hosting and application infrastructure (for example, database,
                    authentication, file storage);
                </li>
                <li>
                    Artificial intelligence and mapping providers (for example, processing images and
                    text to produce insights, and geocoding or map display);
                </li>
                <li>
                    Email delivery providers for transactional or administrative messages where
                    configured.
                </li>
            </ul>
            <p>
                We bind processors to appropriate confidentiality and security obligations to the
                extent required by law and contract.
            </p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Professional Advisers</h3>
            <p>Lawyers, auditors, or insurers where necessary and subject to confidentiality.</p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Authorities</h3>
            <p>
                Regulators, courts, or law enforcement when we believe in good faith that disclosure
                is required by law or is necessary to protect vital interests.
            </p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Business Transfers</h3>
            <p>
                A successor in a merger, acquisition, or asset sale, subject to appropriate
                safeguards and notice where required.
            </p>
            </LegalFlowSubsection>
            <LegalFlowSubsection>
            <h3 className="text-base font-semibold text-foreground">Other Users</h3>
            <p>
                Certain content you submit (for example, reviews or shareable report links you choose
                to distribute) may be visible to other users or the public as designed in the
                product.
            </p>
            <p>
                We do not authorise recipients to use your personal information for their own
                unrelated marketing unless you have agreed or law permits.
            </p>
            </LegalFlowSubsection>
            </LegalFlowSubsections>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Cross-Border Processing
            </h2>
            <p>
                Some of our service providers may process personal information in countries outside
                South Africa (for example, where cloud regions or AI infrastructure are located).
            </p>
            <p>
                Where POPIA applies to cross-border flows, we take steps that the law requires, which
                may include ensuring an adequate level of protection, your consent, or a binding
                agreement with the recipient, having regard to the nature of the information and
                the safeguards offered.
            </p>
            <p>
                If you need detail about a specific transfer, contact us using the details at the top
                of this policy.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Cookies and Similar Technologies
            </h2>
            <p>We use:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    <strong className="font-semibold text-foreground">
                        Essential cookies and tokens
                    </strong>{' '}
                    required for authentication, security, and core functionality (for example,
                    session maintenance and abuse prevention identifiers such as quota-related cookies
                    where implemented); and
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Browser storage</strong> (session
                    storage and local storage) for short-lived client-side state (for example, session
                    identifiers, navigation context between steps, or cached non-sensitive UI state).
                </li>
            </ul>
            <p>
                You can control cookies through your browser settings. Blocking essential cookies may
                prevent parts of Menda from working.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Direct Marketing
            </h2>
            <p>
                We will only send direct marketing communications (for example, promotional emails
                or SMS) where permitted by POPIA, typically where you have opted in or where a
                limited exception applies. You may opt out of marketing at any time using the
                mechanism in the message or by contacting us.
            </p>
            <p>
                Transactional or service-related messages (for example, security notices or
                responses to support tickets) are not direct marketing in the usual sense, but you may
                still contact us to discuss preferences.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Security</h2>
            <p>
                We implement reasonable technical and organisational measures appropriate to the
                risks, including access controls, encryption in transit where standard for web
                services, and supplier due diligence. No online service can guarantee absolute
                security.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Retention</h2>
            <p>
                We retain personal information only for as long as necessary for the purposes
                described above, including legal, accounting, or reporting requirements, and product
                analytics retention consistent with our internal policies.
            </p>
            <p>
                Some derived or aggregated information may be retained in non-identifying form for
                statistics. Cached or log data may have shorter retention.
            </p>
            <p>
                When personal information is no longer required, we will delete, destroy, or
                de-identify it in accordance with POPIA, subject to lawful retention needs.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Your Rights (Data Subject Participation)
            </h2>
            <p>POPIA grants you rights that may include, subject to exceptions in the Act:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                <li>
                    <strong className="font-semibold text-foreground">Access</strong> — request
                    confirmation of whether we hold personal information about you and request access
                    to it;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Correction</strong> — request
                    correction or deletion of inaccurate, irrelevant, excessive, out of date,
                    incomplete, or misleading information;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Objection</strong> — object to
                    processing of your personal information on reasonable grounds;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Restriction or stopping</strong>{' '}
                    — in appropriate cases, ask us to restrict or stop processing;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Withdrawal of consent</strong>{' '}
                    — where processing was based on consent;
                </li>
                <li>
                    <strong className="font-semibold text-foreground">Complaint</strong> — lodge a
                    complaint with the Information Regulator (see below).
                </li>
            </ul>
            <p>
                To exercise rights, email{' '}
                {c.privacyEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        <span className="text-muted-foreground">privacy@menda.co.za</span>{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm before launch)
                        </span>
                    </>
                ) : (
                    <EmailOrText value={c.privacyEmail} />
                )}{' '}
                with a description of your request. We may need to verify your identity before
                responding. We will respond within the timelines POPIA allows (or explain any lawful
                extension).
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Notification to Data Subjects (Section 18 POPIA)
            </h2>
            <p>
                When we collect personal information directly from you, POPIA section 18 requires
                that you are made aware of key matters. This policy, together with just-in-time
                notices in the product where we provide them, is intended to meet that openness
                obligation. In summary, you should know who we are, what information we collect and
                why, whether supply is voluntary or mandatory and consequences if you refuse,
                recipients or categories of recipients, whether information is transferred
                cross-border, and your rights and how to complain.
            </p>
            <p>
                If we collect personal information from a third-party source, we will take
                reasonable steps to comply with POPIA, including notification where required.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Lodging a Complaint With the Information Regulator
            </h2>
            <p>
                If you believe we have interfered with your privacy, you may lodge a complaint with
                the Information Regulator of South Africa:
            </p>
            <div className="flex flex-col gap-2 rounded-lg border border-input bg-secondary/40 p-4 text-xs sm:text-sm">
                <p>
                    <strong className="font-semibold text-foreground">
                        Information Regulator (South Africa)
                    </strong>
                </p>
                <p>JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001</p>
                <p>P.O. Box 31533, Braamfontein, Johannesburg, 2017</p>
                <p>
                    <strong className="text-foreground">General enquiries:</strong>{' '}
                    enquiries@inforegulator.org.za
                </p>
                <p>
                    <strong className="text-foreground">POPIA complaints:</strong>{' '}
                    POPIAComplaints@inforegulator.org.za
                </p>
                <p>
                    <strong className="text-foreground">Website:</strong>{' '}
                    <a
                        href="https://inforegulator.org.za"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        inforegulator.org.za
                    </a>
                </p>
            </div>
            <p>
                We ask that you contact us first so we can try to resolve the matter, but you may
                approach the Regulator at any stage where POPIA allows.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Children</h2>
            <p>
                Menda is not directed at children under 18. We do not knowingly collect personal
                information from children without appropriate parental consent. If you believe we have
                done so, contact us and we will take steps to delete the information where required.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Changes to This Policy
            </h2>
            <p>
                We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date
                at the top will change, and for material changes we will provide additional notice
                where appropriate (for example, a banner or email). Continued use of Menda after
                the effective date may constitute acceptance of the updated policy where law allows.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">
                Automated Decision-Making
            </h2>
            <p>
                Some features use automated processing, including machine learning or AI models, to
                generate suggestions or classifications (for example, maintenance-related insights).
                You should treat outputs as informational and not as a substitute for an on-site
                assessment by a qualified professional where safety or building regulations require
                it. You may request human review of decisions that significantly affect you where
                POPIA requires it and the decision is solely automated; contact us to discuss.
            </p>
            </LegalFlowSection>
            <LegalFlowSection>
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p>Questions about this policy or our privacy practices:</p>
            <p>
                <strong className="font-semibold text-foreground">Email:</strong>{' '}
                {c.privacyEmail === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        <span className="text-muted-foreground">privacy@menda.co.za</span>{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm before launch)
                        </span>
                    </>
                ) : (
                    <EmailOrText value={c.privacyEmail} />
                )}
            </p>
            <p>
                <strong className="font-semibold text-foreground">Contact form:</strong>{' '}
                <Link
                    href="/contact"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    menda.co.za/contact
                </Link>
            </p>
            <p>
                <strong className="font-semibold text-foreground">Information Officer:</strong>{' '}
                {c.informationOfficerName === LEGAL_DETAILS_UNPUBLISHED ? (
                    <>
                        Matthew Prowse{' '}
                        <span className="italic text-muted-foreground">
                            (placeholder — confirm designation before launch)
                        </span>
                    </>
                ) : (
                    c.informationOfficerName
                )}
            </p>

            <p className="text-xs italic text-muted-foreground">
                This document is provided to align with commonly understood POPIA disclosure practices
                as at the date above. Regulatory guidance and case law evolve; periodic review by a
                qualified South African attorney is recommended.
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
                    href="/terms"
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                >
                    Terms of Service
                </Link>
                .
            </p>
            </LegalFlowSection>
            </LegalFlowSections>
        </LegalFlowDocument>
    );
}
