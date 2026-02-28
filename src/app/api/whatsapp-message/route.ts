import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        const body = await req.json();
        const { diagnosis, provider_name, trade, report_url } = body;

        if (!diagnosis || !provider_name) {
            return NextResponse.json(
                { error: 'diagnosis and provider_name are required' },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Derive a short issue description from the diagnosis and trade
        // e.g. "a gate motor fault" or "a plumbing issue"
        const issueHint = trade && trade !== 'N/A' ? trade.toLowerCase() : diagnosis.toLowerCase();

        const prompt = `You are composing a short WhatsApp message. A homeowner will send this to a service provider to request a quote. Follow the template below exactly.

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
- Provider name (use first name or full name): ${provider_name}
- Issue (derive a natural short phrase from this, e.g. "a gate motor fault", "a blocked drain", "an electrical issue"): ${issueHint}
- Report URL: ${report_url || ''}

INSTRUCTIONS FOR FILLING IN THE TEMPLATE:
- [PROVIDER FIRST NAME]: Use the first word of the provider name if it looks like a person's name. If it is a business name, use the full business name.
- [ISSUE]: Write a short natural phrase describing the issue (e.g. "a gate motor fault", "a plumbing issue in my bathroom"). Derive it only from the issue field above.
- [REPORT URL LINE]: If a report URL is provided, write exactly: "View the full report here: [the URL]". If no URL is provided, omit this line entirely.
- Keep the "---" separator and the "*Scandio Job Report*" heading exactly as shown.`;

        const result = await model.generateContent(prompt);
        let text = result.response
            .text()
            .trim()
            .replace(/^["']|["']$/g, '')
            // Remove any em/en dashes the model sneaks in despite instructions
            .replace(/\s*[—–]\s*/g, ', ');

        return NextResponse.json({ message: text });
    } catch (e: any) {
        console.error('WhatsApp message generation error:', e);
        return NextResponse.json(
            { error: e?.message || 'Failed to generate message' },
            { status: 500 }
        );
    }
}
