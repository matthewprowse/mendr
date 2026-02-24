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

        const prompt = `You are writing a WhatsApp message. A homeowner will send this to a service provider. It must sound like a real person wrote it—casual, direct, natural. NO corporate speak, NO "I would appreciate", NO "We've identified". Write like someone texting a contractor.

Context:
- Provider name: ${provider_name}
- Diagnosis/issue: ${diagnosis}
- Trade/solution needed: ${trade || 'N/A'}
- Action required (technical details): ${action_required || 'N/A'}
- Estimated cost (for context): ${estimated_cost || 'N/A'}

Output ONLY the message text. No quotes, no preamble. Use natural sentence casing (e.g. "a leaking pipe" not "A Leaking Pipe").

STRUCTURE:
- Open with a short, natural greeting (e.g. "Hi", "Hey").
- In your own words, briefly describe the issue and what you need help with. 2–3 short sentences max. Sound like you're explaining it to a mate.
- End with what you want from them (quote, when they can come, etc.) — keep it brief.
- At the very bottom only, add a single short line: "Got the diagnosis from Scandio — their app helped me figure out what's going on." Do not mention Scandio anywhere else in the message.`;

        const result = await model.generateContent(prompt);
        const text = result.response
            .text()
            .trim()
            .replace(/^["']|["']$/g, '');

        return NextResponse.json({ message: text });
    } catch (e: any) {
        console.error('WhatsApp message generation error:', e);
        return NextResponse.json(
            { error: e?.message || 'Failed to generate message' },
            { status: 500 }
        );
    }
}
