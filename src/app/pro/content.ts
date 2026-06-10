/**
 * Shared contractor-landing content. Imported by both the client UI
 * (`client.tsx`) and the server page (`page.tsx`) so the on-page FAQ and the
 * FAQPage JSON-LD never drift apart.
 */
export const PRO_FAQS = [
    {
        q: 'Is it free to join right now?',
        a: 'Yes. Joining during the founding phase is completely free. There is no application fee, no monthly subscription cost during onboarding, and Mendr does not take commission on any jobs you complete through the platform. This founding period is how we build a high-quality provider network before rolling out paid plans. Providers who join now lock in favourable terms and are given advance notice before any pricing changes take effect, with no automatic billing surprises.',
    },
    {
        q: 'What kind of enquiries will we actually receive?',
        a: 'Enquiries through Mendr come from homeowners who have already been through a structured AI diagnosis of their problem. That means when a homeowner contacts you, they can typically tell you what the likely fault is, roughly how urgent it is, and what they have already observed — rather than just saying "something is broken." In practice this reduces the back-and-forth that usually happens before a site visit. You spend less time clarifying the problem and more time quoting and doing the work. The enquiry quality is meaningfully different from a generic directory listing or cold lead.',
    },
    {
        q: 'How does Mendr decide which providers to recommend?',
        a: 'Recommendations are produced by a composite ranking algorithm that weighs four signals: service relevance (how closely your trade and specialisation match the diagnosed problem), your Bayesian-smoothed rating (which prevents a handful of five-star reviews from inflating a sparse profile), geographic proximity to the homeowner, and recent activity. No single signal dominates. A highly-rated provider who is 12 km away may rank above a closer provider with fewer reviews and a weaker specialisation match. Profile completeness also adds a small but meaningful boost — providers with photos, a detailed bio, and listed specialisations consistently perform better in matching.',
    },
    {
        q: 'Can we control which areas and trades we appear in?',
        a: 'Yes, and this is one of the most important parts of your profile to get right. Your operating area and service categories are the primary inputs to how matching calculates relevance. If you set your radius to cover Cape Town\'s southern suburbs, you will not appear in recommendations for homeowners in the northern suburbs. If your trade is set to Electrical with a specialisation in DB board upgrades, a homeowner diagnosed with a gate motor fault is unlikely to see you — which is the intended behaviour. Setting these accurately means the enquiries you receive are genuinely within your operational scope, which reduces wasted call-outs.',
    },
    {
        q: 'Do we need to use Mendr\'s pricing or quoting tools?',
        a: 'No. Mendr does not have a built-in quoting tool and has no interest in sitting between you and your pricing process. The platform is focused entirely on diagnosis context and qualified matching. Once a homeowner contacts you through Mendr, everything from that point — how you quote, how you invoice, how you communicate — is handled entirely through your own existing process. You keep full commercial control over every job.',
    },
    {
        q: 'What happens if a homeowner\'s diagnosis turns out to be wrong?',
        a: 'Mendr\'s AI diagnosis is an informed starting point, not a guaranteed assessment. Homeowners are shown a confidence score alongside every diagnosis, and are reminded that a site assessment is needed before any work is confirmed. In practice, this means your team arrives with a reasonable hypothesis about the fault rather than a blank slate — but you still do the professional assessment on-site. If the actual problem differs from the diagnosis, that is a normal part of the trade and is fully expected. The diagnosis is there to improve the quality of the first conversation, not to replace your expertise.',
    },
    {
        q: 'How does profile quality affect how often we are shown?',
        a: 'Profile completeness directly influences your ranking score and how homeowners perceive you when comparing providers side by side. A profile with verified work photos, a well-written bio, specific trade specialisations, and a good volume of genuine reviews consistently outperforms a sparse profile with the same rating. Homeowners see your profile summary, highlights, and review snapshot when choosing who to contact — a detailed profile gives them the confidence to reach out rather than scroll past. Profile quality is not a one-off setup; it compounds over time as reviews accumulate and your specialisations become more specific.',
    },
    {
        q: 'When do paid plans start and how much notice will we get?',
        a: 'Paid plans are planned for later in 2026, once the platform has a stable homeowner base and consistent enquiry volume. Founding providers will receive a minimum of 30 days\' written notice before any billing begins, and will be given the option to select a plan or opt out before any charges are made. There will be no automatic upgrade from the free founding tier to a paid plan — it will always require your explicit confirmation. The plan tiers and pricing are shown below so you know exactly what to expect.',
    },
    {
        q: 'Is Mendr available outside Cape Town?',
        a: 'Cape Town is where Mendr launched and where the founding provider network is being built. Geographic expansion is planned but will follow homeowner demand — the platform will open new areas once there is enough volume in a region to make provider matching meaningful. If your business operates in another South African city or region, you are welcome to apply now and we will notify you as coverage expands to your area.',
    },
    {
        q: 'How do we get started?',
        a: 'Click the "Apply To Join The Network" button on this page. The application takes around five minutes and covers your business details, trade categories, and operating area. Once reviewed and approved — typically within a few business days — you will receive a link to complete your full profile setup, including photos, specialisations, and credentials. After that, you are live in the matching system and will begin appearing in relevant homeowner recommendations.',
    },
] as const;
