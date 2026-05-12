import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/ai-client';
import { checkRateLimit } from '@/lib/rate-limit-config';

type Body = {
    diagnosis?: string;
    provider_name?: string;
    trade?: string;
    action_required?: string;
    estimated_cost?: string;
    report_url?: string;
    profile_url?: string;
};

function buildFallbackMessage(input: {
    diagnosis: string;
    provider_name: string;
    trade: string;
    action_required: string;
    estimated_cost: string;
    report_url: string;
    profile_url: string;
}): string {
    const lines: string[] = [];
    lines.push(`Hi, I'm messaging about work I need help with on Scandio.`);
    lines.push('');
    lines.push(`Business: ${input.provider_name}`);
    if (input.trade) lines.push(`Trade: ${input.trade}`);
    if (input.diagnosis && input.diagnosis !== 'Home repair or maintenance') {
        lines.push('');
        lines.push(`Context: ${input.diagnosis.slice(0, 500)}${input.diagnosis.length > 500 ? '…' : ''}`);
    }
    if (input.action_required) lines.push(`Action: ${input.action_required.slice(0, 200)}`);
    if (input.estimated_cost) lines.push(`Estimated cost (from Scandio): ${input.estimated_cost}`);
    lines.push('');
    if (input.report_url) {
        lines.push(`My Scandio report: ${input.report_url}`);
    } else if (input.profile_url) {
        lines.push(`I found you on Scandio: ${input.profile_url}`);
    }
    lines.push('');
    lines.push(`Could you help with a quote or next steps?`);
    return lines.join('\n');
}

/**
 * POST /api/whatsapp-message
 * Builds a short WhatsApp-ready message (Gemini when configured, else template).
 */
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'whatsappMessage');
    if (limited) return limited;

    try {
        const body = (await req.json()) as Body;
        const provider_name = String(body.provider_name || 'the business').trim() || 'the business';
        const diagnosis = String(body.diagnosis || '').trim() || 'Home repair or maintenance';
        const trade = String(body.trade || '').trim();
        const action_required = String(body.action_required || '').trim();
        const estimated_cost = String(body.estimated_cost || '').trim();
        const report_url = String(body.report_url || '').trim();
        const profile_url = String(body.profile_url || '').trim();

        const fallback = buildFallbackMessage({
            diagnosis,
            provider_name,
            trade,
            action_required,
            estimated_cost,
            report_url,
            profile_url,
        });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ message: fallback });
        }

        try {
            const model = getGeminiModel();

            const prompt = `You write short WhatsApp messages for South African homeowners contacting home-service businesses.
British English. Warm and practical. No markdown or bullet lists. Under 900 characters.
Include the report or profile link verbatim if provided. Do not invent facts.

Write ONE message the customer can send to "${provider_name}".

Context:
- What they need / diagnosis: ${diagnosis}
${trade ? `- Trade: ${trade}` : ''}
${action_required ? `- Action: ${action_required}` : ''}
${estimated_cost ? `- Cost note: ${estimated_cost}` : ''}
${report_url ? `- Their Scandio report URL (include exactly): ${report_url}` : ''}
${!report_url && profile_url ? `- Scandio profile URL (include exactly): ${profile_url}` : ''}

Reply with only the message text, nothing else.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            if (!text) {
                return NextResponse.json({ message: fallback });
            }
            return NextResponse.json({
                message: text.length > 4000 ? text.slice(0, 3990) + '…' : text,
            });
        } catch {
            return NextResponse.json({ message: fallback });
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to generate message';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
