import Link from 'next/link';
import { FlowStepHeader } from '@/components/flow-header';
import {
    LegalFlowDocument,
    LegalFlowIntro,
    LegalFlowSection,
    LegalFlowSections,
} from '@/components/legal-flow-layout';

export const metadata = {
    title: 'Contractor Terms | Mendr',
    description:
        'Terms specific to contractors who list their business on Mendr — covers subscriptions, POPIA, liability, suspensions and dispute resolution.',
    robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-05-23';

export default function ContractorTermsPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={1} onBack={null} backHref="/contractors" centerLabel="Contractor Terms" />
            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 pb-16 pt-20 sm:px-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-semibold text-foreground">Contractor Terms</h1>
                    <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}.</p>
                </div>

                <LegalFlowDocument>
                    <LegalFlowIntro>
                        <p>
                            These Contractor Terms apply to any tradesperson, sole proprietor,
                            partnership or registered organisation (a &quot;Contractor&quot;) who
                            applies to be listed on, or who is listed on, the Mendr platform. They
                            are in addition to our general{' '}
                            <Link
                                href="/terms"
                                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                            >
                                Terms of Service
                            </Link>{' '}
                            and{' '}
                            <Link
                                href="/privacy"
                                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                            >
                                Privacy Policy
                            </Link>
                            . Where there is a conflict on a contractor-specific matter, these
                            Contractor Terms take priority.
                        </p>
                        <p>
                            Mendr is an information service that connects homeowners in the Western
                            Cape with vetted local contractors. Mendr does not perform any
                            installation, repair or maintenance work itself. Contractors operate as
                            independent businesses and are solely responsible for the work they
                            quote and carry out.
                        </p>
                        <p>
                            These terms are written in plain English. They are not a substitute for
                            legal advice — a qualified attorney should review them before they are
                            relied on as binding.
                        </p>
                    </LegalFlowIntro>

                    <section className="flex flex-col gap-3 rounded-lg border border-input bg-secondary/50 p-4 text-sm leading-relaxed text-foreground">
                        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Quick summary
                        </p>
                        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
                            <li>
                                Listing on Mendr is free during the current launch phase. Paid
                                plans, if introduced, will be communicated at least 30 days in
                                advance.
                            </li>
                            <li>
                                You are an independent business. Mendr does not employ you, supply
                                you with materials, or guarantee your workmanship to homeowners.
                            </li>
                            <li>
                                You must keep your profile accurate and process any homeowner
                                personal information you receive in line with POPIA.
                            </li>
                            <li>
                                Tax compliance (income tax, VAT, SARS registration) is entirely
                                your responsibility.
                            </li>
                            <li>
                                We can suspend or remove your listing for serious or repeated
                                breaches — we will normally tell you first and give you a chance to
                                respond.
                            </li>
                        </ul>
                    </section>

                    <LegalFlowSections>
                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                1. Eligibility and contractor status
                            </h2>
                            <p>
                                You may apply to be listed on Mendr if you are at least 18 years old
                                and you operate a lawful trade or services business in the Western
                                Cape. You may apply as a sole proprietor, a partnership, a close
                                corporation, or a registered company.
                            </p>
                            <p>
                                You are an independent contractor. Nothing in these terms creates
                                an employment, agency, joint venture or partnership relationship
                                between you and Mendr. You decide how, when and where you work, you
                                set your own prices, and you choose which jobs to accept.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                2. Subscription terms and changes to pricing
                            </h2>
                            <p>
                                Listing on Mendr is currently free for contractors. We may
                                introduce paid plans in the future (for example, a monthly
                                subscription for premium placement, lead packs, or additional
                                tooling). If we do, we will:
                            </p>
                            <ul className="list-disc flex-col gap-2 pl-5">
                                <li>
                                    give you at least <strong>30 days&apos; written notice</strong>{' '}
                                    (typically by email and an in-app notice);
                                </li>
                                <li>
                                    explain what is changing, what it will cost, and what you get;
                                    and
                                </li>
                                <li>
                                    give you the option to opt out before any charge is made — if
                                    you opt out, your listing may revert to a free tier with
                                    reduced features.
                                </li>
                            </ul>
                            <p>
                                We will not automatically convert a free listing into a paid plan
                                without your explicit consent.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                3. POPIA and processing of homeowner data
                            </h2>
                            <p>
                                When a homeowner contacts you through Mendr, you receive personal
                                information about them — typically a name, contact details, a
                                description of the fault and sometimes a photograph or video. This
                                is &quot;personal information&quot; under the Protection of
                                Personal Information Act 4 of 2013 (POPIA), and you become a{' '}
                                <strong>responsible party</strong> for how you handle it.
                            </p>
                            <p>You agree that you will:</p>
                            <ul className="list-disc flex-col gap-2 pl-5">
                                <li>
                                    use the homeowner&apos;s information only to respond to the
                                    enquiry, quote and (if engaged) carry out the work;
                                </li>
                                <li>
                                    not share the information with anyone else except where
                                    strictly necessary to perform the work (for example,
                                    sub-contractors or suppliers) and on equivalent confidentiality
                                    terms;
                                </li>
                                <li>
                                    store the information securely and delete or anonymise it once
                                    it is no longer needed for the engagement or for tax or
                                    legal-record purposes;
                                </li>
                                <li>
                                    not use the information for unrelated marketing without the
                                    homeowner&apos;s separate, explicit consent; and
                                </li>
                                <li>
                                    tell Mendr without undue delay if you become aware of a data
                                    breach involving information you received through the
                                    platform.
                                </li>
                            </ul>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                4. Liability for work performed
                            </h2>
                            <p>
                                You are solely responsible for any work you quote, agree, or carry
                                out for a homeowner introduced through Mendr. This includes the
                                quality of the work, materials used, statutory compliance (for
                                example, electrical compliance certificates issued under the
                                Occupational Health and Safety Act and its regulations), and any
                                warranty or guarantee you offer.
                            </p>
                            <p>
                                You agree to indemnify Mendr against any claim, loss, damage or
                                expense that arises from work you have performed, omitted to
                                perform, or misrepresented — except to the extent the claim is
                                caused by Mendr&apos;s own gross negligence or wilful misconduct.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                5. Mendr is not a guarantor of workmanship
                            </h2>
                            <p>
                                Mendr screens contractors before listing them and asks homeowners
                                to leave honest feedback after a job. We do not, however, supervise
                                or inspect contractor work, and we do not guarantee the quality,
                                timeliness or safety of any work you perform. Homeowners are
                                expected to satisfy themselves about a contractor&apos;s suitability
                                before engaging them.
                            </p>
                            <p>
                                Nothing on the Mendr platform should be read as a recommendation,
                                endorsement, or warranty from Mendr in respect of a specific job.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                6. Profile accuracy obligations
                            </h2>
                            <p>You must keep your Mendr profile accurate and up to date. In particular:</p>
                            <ul className="list-disc flex-col gap-2 pl-5">
                                <li>
                                    your business name, contact details and service areas must
                                    reflect the business that will actually carry out the work;
                                </li>
                                <li>
                                    any certifications, registrations or qualifications you list
                                    (for example, an electrical contractor licence) must be current
                                    and valid;
                                </li>
                                <li>
                                    photographs must represent work you (or your team) carried out
                                    — not stock imagery or other contractors&apos; work; and
                                </li>
                                <li>
                                    you must tell us promptly if your registration status, trading
                                    name, address or contact details change.
                                </li>
                            </ul>
                            <p>
                                Knowingly listing inaccurate information is grounds for immediate
                                suspension or removal from the platform.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                7. Tax and regulatory compliance
                            </h2>
                            <p>
                                You are responsible for your own tax and regulatory compliance,
                                including:
                            </p>
                            <ul className="list-disc flex-col gap-2 pl-5">
                                <li>
                                    income tax and any provisional tax obligations with SARS;
                                </li>
                                <li>
                                    VAT registration once you exceed the compulsory threshold (and
                                    voluntary registration below that threshold if you elect to);
                                </li>
                                <li>
                                    UIF and SDL contributions if you employ staff;
                                </li>
                                <li>
                                    any trade-specific licensing or registration (for example, the
                                    Department of Employment and Labour register of electrical
                                    contractors).
                                </li>
                            </ul>
                            <p>
                                Mendr does not deduct, withhold or remit any tax on your behalf,
                                and does not issue tax invoices or IRP5 certificates to you.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                8. Suspension and removal
                            </h2>
                            <p>
                                We may suspend your listing temporarily or remove it permanently
                                if, in our reasonable view:
                            </p>
                            <ul className="list-disc flex-col gap-2 pl-5">
                                <li>
                                    you materially breach these Contractor Terms, the general Terms
                                    of Service, or applicable South African law;
                                </li>
                                <li>
                                    we receive credible, repeated complaints about your behaviour,
                                    workmanship or safety;
                                </li>
                                <li>
                                    you misrepresent your business, qualifications or work;
                                </li>
                                <li>
                                    you use the platform to harass other users, send spam, or
                                    bypass Mendr&apos;s communication channels in bad faith; or
                                </li>
                                <li>
                                    we are required to do so by a regulator, court order or other
                                    binding instruction.
                                </li>
                            </ul>
                            <p>
                                Except where the issue is urgent (for example, a safety risk or a
                                regulator&apos;s instruction), we will normally tell you what the
                                concern is and give you a reasonable opportunity to respond before
                                a permanent removal.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                9. Reviews and ratings
                            </h2>
                            <p>
                                Mendr collects post-job feedback from homeowners. We display
                                aggregated ratings and (where the homeowner consents) review
                                excerpts on your profile. We may also use review signals as part
                                of how we rank contractors in homeowner matches.
                            </p>
                            <p>
                                You agree not to solicit fake reviews, ask homeowners to remove
                                negative reviews under pressure, or offer incentives in exchange
                                for a specific rating. You may, of course, reply to a review and
                                ask the homeowner or Mendr to correct factual mistakes.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                10. Disputes between contractor and homeowner
                            </h2>
                            <p>
                                A dispute about a quote, a payment or the quality of work is
                                between you and the homeowner. Mendr is not a party to that
                                contract and is not obliged to mediate, refund or otherwise resolve
                                it.
                            </p>
                            <p>
                                That said, we will normally try to help informally where we can —
                                for example, by sharing the relevant communication history with
                                both sides, or by pointing the homeowner to the National Consumer
                                Commission, the Consumer Goods and Services Ombud, or a small
                                claims court if appropriate.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                11. Dispute escalation between you and Mendr
                            </h2>
                            <p>
                                If you have a dispute with Mendr, please contact us first at the
                                address shown on our main Terms of Service. We will acknowledge the
                                dispute within five business days and aim to resolve it within 30
                                days.
                            </p>
                            <p>
                                If the dispute cannot be resolved informally, the parties agree to
                                attempt mediation before commencing litigation, unless urgent
                                interim relief is needed.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                12. Changes to these terms
                            </h2>
                            <p>
                                We may update these Contractor Terms from time to time. Material
                                changes will be communicated by email or an in-app notice with at
                                least 14 days&apos; advance notice. Continued use of the platform
                                after the effective date constitutes acceptance of the updated
                                terms.
                            </p>
                        </LegalFlowSection>

                        <LegalFlowSection>
                            <h2 className="text-lg font-semibold text-foreground">
                                13. Governing law and jurisdiction
                            </h2>
                            <p>
                                These Contractor Terms are governed by the laws of the Republic of
                                South Africa. The parties consent to the jurisdiction of the
                                Western Cape High Court, Cape Town, in respect of any dispute
                                arising out of or in connection with these terms, without
                                prejudice to any right to commence proceedings in a Magistrates&apos;
                                Court where it has jurisdiction.
                            </p>
                        </LegalFlowSection>
                    </LegalFlowSections>
                </LegalFlowDocument>
            </main>
        </div>
    );
}
