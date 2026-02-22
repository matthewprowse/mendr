import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        const body = await req.json();
        const { diagnosis, provider_name, trade, action_required, estimated_cost } = body;

        if (!diagnosis || !provider_name) {
            return NextResponse.json(
                { error: 'diagnosis and provider_name are required' },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `You are writing a WhatsApp message from Scandio's AI Assistant. A homeowner will send this to a service provider.

Context:
- Provider name: ${provider_name}
- Diagnosis/issue: ${diagnosis}
- Trade/solution needed: ${trade || 'N/A'}
- Action required (technical details): ${action_required || 'N/A'}
- Estimated cost (for context): ${estimated_cost || 'N/A'}

Write a message that EXACTLY follows this structure. Fill in the placeholders from the context above. Do NOT write the diagnosis/issue in title case—use natural sentence casing (e.g. "a leaking pipe" not "A Leaking Pipe"). Output ONLY the message text. No quotes, no preamble.

REQUIRED STRUCTURE:

Hi ${provider_name}.

I'm contacting you with a diagnosis provided by Scandio's assistant, who's assisted in diagnosing my home maintenance issue.

We've identified [ISSUE - summarise the diagnosis in 1 short sentence], and are now looking for [SOLUTION - the trade/service needed in 1 short phrase or sentence]. We want to get started with this [URGENCY - e.g. "as soon as possible", "at your earliest convenience", or a rough timeline like "within the next week"].

I would appreciate an estimated quote, timeline, and am happy to provide further details.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().replace(/^["']|["']$/g, '');

        return NextResponse.json({ message: text });
    } catch (e: any) {
        console.error('WhatsApp message generation error:', e);
        return NextResponse.json(
            { error: e?.message || 'Failed to generate message' },
            { status: 500 }
        );
    }
}
