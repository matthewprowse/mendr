import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/ai-client';
import { aiConfig } from '@/lib/ai-config';
import { logAiEvent } from '@/lib/ai-logging';

function buildWhatsAppPrompt(issueHint: string, providerName: string, reportUrl?: string | null): string {
    return `You are composing a short WhatsApp message. A homeowner will send this to a service provider to request a quote. Follow the template below exactly.

STRICT RULES:
- Use British English (e.g. "recognised", "organise", "colour").
- No em dashes (—), no en dashes (–). Use a comma or a full stop instead.
- No bullet points, no bold, no markdown.
- No corporate speak. Keep it natural and direct.
- Do not add details that are not in the template or data fields below.
- Do not diagnose or speculate. The homeowner is asking the provider to come and assess.
- Output ONLY the message text. No quotes, no preamble.

TEMPLATE (fill in the bracketed fields using the data below — keep everything else word for word):

Hi [PROVIDER FIRST NAME],

I used Scandio to help identify an issue with [ISSUE]. The app suggested I get in touch with you to come and take a proper look and assist with the repair.

Could you let me know when you are available to visit and give me a quote?

---

*Scandio Job Report*
I have attached a Scandio report below. It includes my contact details, location, photos of the issue, and an initial assessment from the app. It should give you everything you need before you arrive.

[REPORT URL LINE — only include if a report URL is provided]

Sent via Scandio.

DATA:
- Provider name (use first name or full name): ${providerName}
- Issue (derive a natural short phrase from this, e.g. "a gate motor fault", "a blocked drain", "an electrical issue"): ${issueHint}
- Report URL: ${reportUrl || ''}

INSTRUCTIONS FOR FILLING IN THE TEMPLATE:
- [PROVIDER FIRST NAME]: Use the first word of the provider name if it looks like a person's name. If it is a business name, use the full business name.
- [ISSUE]: Write a short natural phrase describing the issue (e.g. "a gate motor fault", "a plumbing issue in my bathroom"). Derive it only from the issue field above.
- [REPORT URL LINE]: If a report URL is provided, write exactly: "View the full report here: [the URL]". If no URL is provided, omit this line entirely.
- Keep the "---" separator and the "*Scandio Job Report*" heading exactly as shown.`;
}

function buildStaticWhatsAppMessage(issueHint: string, providerName: string, reportUrl?: string | null): string {
    const providerFirst =
        providerName?.trim().split(/\s+/)[0] || 'there';

    const lines = [
        `Hi ${providerFirst},`,
        '',
        `I used Scandio to help identify an issue with ${issueHint || 'a home maintenance problem'}. The app suggested I get in touch with you to come and take a proper look and assist with the repair.`,
        '',
        'Could you let me know when you are available to visit and give me a quote?',
        '',
        '---',
        '',
        '*Scandio Job Report*',
        'I have attached a Scandio report below. It includes my contact details, location, photos of the issue, and an initial assessment from the app. It should give you everything you need before you arrive.',
    ];

    if (reportUrl) {
        lines.push('', `View the full report here: ${reportUrl}`);
    }

    lines.push('', 'Sent via Scandio.');

    return lines.join('\n');
}

export async function POST(req: NextRequest) {
    try {
        const startedAt = Date.now();
        const body = await req.json();
        const { diagnosis, provider_name, trade, report_url } = body;

        if (!diagnosis || !provider_name) {
            return NextResponse.json(
                { error: 'diagnosis and provider_name are required' },
                { status: 400 }
            );
        }

        // Derive a short issue description from the diagnosis and trade
        // e.g. "a gate motor fault" or "a plumbing issue"
        const issueHint = trade && trade !== 'N/A' ? trade.toLowerCase() : diagnosis.toLowerCase();
        const useAi = aiConfig.enableWhatsappAiMessage;

        if (!useAi) {
            const fallback = buildStaticWhatsAppMessage(issueHint, provider_name, report_url);
            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'whatsapp',
                status: 'ok',
                durationMs,
                meta: {
                    usedAi: false,
                    usedFallback: true,
                    hasReportUrl: Boolean(report_url),
                },
            });
            return NextResponse.json({ message: fallback });
        }

        try {
            const model = getGeminiModel();
            const prompt = buildWhatsAppPrompt(issueHint, provider_name, report_url);
            const result = await model.generateContent(prompt);
            let text = result.response
                .text()
                .trim()
                .replace(/^["']|["']$/g, '')
                // Remove any em/en dashes the model sneaks in despite instructions
                .replace(/\s*[—–]\s*/g, ', ');

            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'whatsapp',
                status: 'ok',
                durationMs,
                meta: {
                    usedAi: true,
                    usedFallback: false,
                    hasReportUrl: Boolean(report_url),
                },
            });

            return NextResponse.json({ message: text });
        } catch (e: any) {
            const fallback = buildStaticWhatsAppMessage(issueHint, provider_name, report_url);
            const durationMs = Date.now() - startedAt;
            logAiEvent({
                endpoint: 'whatsapp',
                status: 'error',
                durationMs,
                meta: {
                    usedAi: true,
                    usedFallback: true,
                    hasReportUrl: Boolean(report_url),
                    error: e?.message || 'Failed to generate message with AI; used fallback',
                },
            });
            // eslint-disable-next-line no-console
            console.error('WhatsApp message generation error (AI, fallback used):', e);
            return NextResponse.json({ message: fallback });
        }
    } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('WhatsApp message generation error:', e);
        return NextResponse.json(
            { error: e?.message || 'Failed to generate message' },
            { status: 500 }
        );
    }
}
