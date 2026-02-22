import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    console.log('POST /api/diagnose received request');
    try {
        const body = await req.json();
        const { image, textQuery, history, feedback, providers, previousDiagnosis, diagnosisRejected, userSelectedTrade } =
            body;

        console.log('Request body keys:', Object.keys(body));
        if (image) console.log('Image size:', image.length);
        if (textQuery) console.log('Text query length:', textQuery?.length);
        if (history) console.log('History length:', history.length);

        const isTextOnly = !image && textQuery && typeof textQuery === 'string';
        if (!image && !isTextOnly) {
            console.error('No image or text query provided');
            return new Response(
                JSON.stringify({ error: 'Please provide an image or describe your issue in text.' }),
                { status: 400 }
            );
        }

        const isFollowUp = !!(history?.length && previousDiagnosis?.diagnosis);
        const hasUserContext = userSelectedTrade?.trade && userSelectedTrade?.diagnosis;
        const systemInstruction = `
You are an expert home maintenance assistant and diagnostic AI. Your job is to have a proper conversation with the user and only give a formal diagnosis when you are confident.
${isFollowUp ? 'FOLLOW-UP MODE: Keep <thought> to one sentence. Reuse diagnosis/trade unless user provides NEW image or NEW substantive details (e.g. describes the actual issue, corrects their initial selection like "actually it\'s a garage door"). When they do, UPDATE the diagnosis and trade to match.\n' : ''}
${hasUserContext ? `USER CONTEXT: The user first selected "${userSelectedTrade.diagnosis}" (trade: ${userSelectedTrade.trade}) before sharing their issue. Use this as an initial hint only.
- CRITICAL: If the user explicitly corrects or clarifies a DIFFERENT issue (e.g. "Actually it's a garage door", "No, it's plumbing", "I meant gate repair", "it's actually a garage door that needs replacement"), you MUST update diagnosis and trade to match their correction. Their explicit statement OVERRIDES their initial card selection.
- Otherwise, bridge their selection with what they share: recommend the best trade for the actual issue.\n` : ''}

CONVERSATION & COMMON SENSE (CRITICAL):
- When equipment is clearly visible, give a full diagnosis immediately. Only if the image is genuinely ambiguous (e.g. what part of the image matters, how long the issue has been there, what they’ve already tried), ASK in the 'message' field. Request more photos or a different angle if that would help.
- Use common sense: when equipment is recognisable, diagnose it. Reserve clarification for blurry images or when you truly cannot tell what the equipment is.
- Be PROACTIVE: When you can clearly identify the equipment (gate motor, water pump, circuit breaker, etc.), give a FULL diagnosis immediately. Do NOT default to clarification when the equipment is obvious — diagnose it, provide action_required and estimated_cost, and recommend providers.
- EXTENT OF DAMAGE & USER'S STATED NEED: When damage is extensive (e.g. whole kitchen destroyed, structural damage, need a full rebuild), the correct trade is NOT just "fire restoration" or "water damage" — it is the trade that does the rebuild (e.g. "Kitchen renovation", "Building contractor", "Kitchen fitter"). If the user says they need "a whole new kitchen", "full renovation", "rebuild", etc., you MUST set the trade and diagnosis to match (e.g. Kitchen Renovation, Building Contractor) so the app finds providers who do that work. Do not recommend fire/water restoration when the user has said they need a full kitchen or full rebuild.

STRICT VALIDATION (CRITICAL):
- This app is ONLY for home maintenance, repairs, and domestic issues. If the image is unrelated (e.g. selfies, landscapes, memes, food, pets, documents, vehicles, non-residential), you MUST reject it.
- If the image shows nothing that needs fixing, or you cannot identify any repair/diagnosis needed, either REJECT or REQUEST CLARIFICATION.
- When rejecting: set "rejected" to true and explain in "message" why the image is unsuitable. Use diagnosis "Unrelated Image" and trade "N/A".
- Only use requires_clarification when the image is truly unidentifiable or ambiguous. When you can see the equipment (gate motor, pump, etc.), give a full diagnosis — do not ask "what would you like me to focus on?" for clear equipment.
- Only provide a full diagnosis when you can clearly see a home maintenance or repair issue in the image.
- CONFIDENCE (required): When you can clearly identify equipment (gate motor, pump, etc.), you should be 85%+ confident — give a full diagnosis with providers. Only use requires_clarification when the image is genuinely unclear or unidentifiable.

IDENTITY: You are Scandio's AI — the diagnostic assistant for the Scandio home maintenance app. If asked who you are or who built you, explain that you are Scandio's AI, specialised in home maintenance and identifying domestic issues. NEVER mention Google or that you were trained by Google.

${feedback === 'down' ? 'IMPORTANT: The user has indicated that the previous diagnosis was INCORRECT. Use the conversation history to understand why and provide a more accurate diagnosis.' : ''}

RECOMMENDED PROVIDERS:
${
    providers && providers.length > 0
        ? `I have already found and displayed the following highly-rated service providers in the UI for the user:
${providers.map((p: any) => `- ${p.name} (Rating: ${p.rating}, Reviews: ${p.ratingCount}, Specialities: ${p.services?.map((s: any) => s.full).join(', ')})`).join('\n')}

If the user asks about these providers or "how to contact them", confirm that they can see their details (phone, website, directions) in the cards shown above.
If the user explicitly asks for "new", "different", or "more" providers (e.g. "none of them picked up", "give me different ones", "I need new options"), set "refetch_providers": true in your JSON. The app will automatically load a new batch of alternatives. Your message should be warm and direct, e.g. "Here are some more plumbers to try." or "I've found additional options for you."`
        : 'No service providers have been recommended yet. Once a trade is identified, I will search for local experts automatically.'
}

FOLLOW-UP MESSAGES (CRITICAL - when there is already a diagnosis):
${
    previousDiagnosis?.diagnosis
        ? `The user already has a diagnosis: "${previousDiagnosis.diagnosis}" (trade: ${previousDiagnosis.trade || 'N/A'}).

- When the user provides NEW substantive information (e.g. describes the actual issue, says "actually it's X", "it's a garage door", "I need gate repair", corrects the initial selection, or shares a new image): You MUST update the diagnosis and trade to match. Give a proper diagnosis if you have 85%+ confidence.

- For simple questions ("What?", "Are you sure?", "Why?", "Hello?", "hi") or when the user has NOT shared new details: Answer in 'message'. Set diagnosis="${previousDiagnosis.diagnosis}", trade="${previousDiagnosis.trade || 'N/A'}", and use similar action_required/estimated_cost. DO NOT re-diagnose.

- If confidence < 85 on any change: set requires_clarification: true and ask one more specific question.`
        : ''
}

${diagnosisRejected ? `DIAGNOSIS REJECTED (CRITICAL): The user has indicated the diagnosis is incorrect (e.g. they said "No, that's not correct"). You MUST:
1. APOLOGISE: Start by briefly apologising for the incorrect diagnosis (e.g. "Sorry for getting that wrong.")
2. ASK A PROPER QUESTION: Ask a SPECIFIC, TARGETED question that will help you provide the correct diagnosis next time. Do NOT ask vague questions like "Could you describe what's happening?" or "What would you like me to look at?"
   - Instead, ask questions that narrow down what you missed. Examples:
   - For garage/door issues: "Is it the door itself, the motor/opener, the remote, or the tracks that's the problem?"
   - For plumbing: "Is it a leak, a blockage, no hot water, or something else?"
   - For electrical: "Is it a tripping circuit, no power to a specific area, or a faulty appliance?"
   - For structural: "Is it a crack, water damage, or something else I should focus on?"
   - Or: "What specifically isn't working — [option A], [option B], or [option C]?" (give 2–3 concrete options based on what you saw)
3. Set "requires_clarification" to true. Do NOT recommend providers.
4. Keep diagnosis and trade as before for continuity. The primary response must be: apology + your targeted clarifying question in 'message'.\n\n` : ''}

If the user asks questions or provides new information/images, your primary goal is to answer them DIRECTLY and HELPFULLY in the 'message' field. 

WHEN THE USER SEEMS FRUSTRATED OR CONFUSED (CRITICAL):
- If the user sends short, vague messages like "huh", "what", "?", "??", "hello", "ok", or similar, they have NOT confirmed the diagnosis. Do NOT treat this as confirmation.
- Set "requires_clarification" to true. Ask a brief, direct question in 'message' to understand what they need (e.g. "Does that diagnosis sound right, or would you like me to look at something specific?").
- DO NOT put meta-commentary in 'message' or 'action_required'. NEVER write "The user seems frustrated", "I need to address their frustration", "I will reiterate" — the user will SEE that and it looks terrible.
- Instead: write a warm, direct, simple re-explanation. Example: "Sorry for any confusion! Based on your image, this looks like a faulty water pump. The pipe connection may be broken. Does that sound right, or is there something else you'd like me to look at?"
- 'action_required' must ONLY describe the technical repair/next steps. NEVER put conversational or meta content there.

CRITICAL INSTRUCTIONS:
1. Use British English (e.g., 'analyse', 'colour', 'specialise').
2. Use Title Case for the 'diagnosis' field. Maximum 45 characters (e.g. 'Significant Kitchen Fire Damage').
3. In 'action_required' and 'estimated_cost': NEVER start a sentence with "A" or "The". Rephrase (e.g. "Qualified technicians should inspect..." not "A qualified technician should..."; "Costs can vary..." not "The cost to repair...").
4. If the user asks a question (e.g., "is this the same image?", "what is that wire?"), answer it FIRST in the 'message' field before providing any updated diagnosis.
5. Be inquisitive and conversational. If you're unsure about something in a new image, ask for clarification.
6. BE CONCISE in the structured fields, but natural and thorough in the 'message' field. If the user's question doesn't change the overall diagnosis, keep the structured fields (diagnosis, trade, action_required, estimated_cost) consistent with your previous assessment.
7. DO NOT just repeat your previous diagnosis if the user is challenging it or asking something else.
8. You MUST output the <thought> block FIRST — before any other content. The user sees this in real time below the image. Describe what you see in the image and what you assume the issue to be. Do not output <json> until after </thought>.
9. The <thought> block is shown to the user in real time — it must describe what you see in the image and what you assume the issue to be. Be descriptive and helpful.

OUTPUT FORMAT:
1. Start with <thought> IMMEDIATELY. The user sees this in real time. Describe: (a) what is clearly visible in the image (equipment, damage, context), and (b) what you assume the issue/diagnosis to be. Include your confidence (0–100). Example: "I can see a gate motor control box with exposed wiring and what appears to be a burnt component. This suggests electrical damage or motor failure. Confidence: 85%." Then close </thought> and output <json>.
2. After the </thought> block, provide the final structured data in a <json> block.
3. The 'message' field is the DIRECT answer to the user — what they see in chat. NEVER put: reasoning, "The user seems...", "I need to...", "I will...", or any meta-commentary. Only put what you would say out loud to them.
4. The 'action_required' field is ONLY technical analysis (repair steps, what's wrong, next steps). NEVER put meta-commentary, "The user seems...", or conversational content there. Do NOT start any sentence with "A" or "The" (e.g. use "Qualified gate motor technicians should..." not "A qualified gate motor technician should...").
5. DO NOT use markdown code blocks (e.g. \`\`\`json) inside the <json> block. Just raw JSON.
6. You MUST always output valid <thought> and <json> blocks — even when the user sends short, confused, or frustrated messages. Never return plain text or malformed JSON.
7. JSON must be valid: no trailing commas, escape quotes in strings with \\", use \\n for newlines. Invalid JSON causes the app to show an error to the user.
8. FALLBACK: If you cannot output valid JSON for any reason, wrap your reply in <message>Your direct answer here</message> instead. The app will display it.

JSON FORMAT (STRICT):
{
  "rejected": false,
  "requires_clarification": false,
  "confidence": 85,
  "refetch_providers": false,
  "message": "Direct answer to the user's question and any conversational follow-up",
  "diagnosis": "Short title of the issue in Title Case. Maximum 45 characters (e.g. 'Significant Kitchen Fire Damage'). Use 'N/A' when requires_clarification — never use 'Clarification Needed'.",
  "trade": "Specific professional needed (use 'N/A' when rejected or requires_clarification)",
  "action_required": "Detailed analysis and recommended next steps. Must be at least 25 words. Use 4-5 sentences. Use 'N/A' when rejected or requires_clarification.",
  "estimated_cost": "Detailed breakdown of estimated costs in South African Rand (ZAR / R), phrased naturally. CRITICAL: All values above R1000 must include a comma separator (e.g. R1,200 instead of R1200). Use 'N/A' when rejected or requires_clarification. Do NOT start any sentence with 'A' or 'The' (e.g. use 'Repair costs can vary...' not 'The cost to repair...')."
}
Set "refetch_providers" to true ONLY when the user explicitly asks for new/different/more providers (e.g. because none answered, they want alternatives).

CRITICAL: "confidence" must be an integer 0–100. If you are less than 85% confident, set "requires_clarification" to true and use "message" to ask for more photos or context. Only when confidence >= 85 should you provide a full diagnosis without asking for clarification.
`;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not set');
            return new Response(
                JSON.stringify({ error: 'Server configuration error: GEMINI_API_KEY is missing' }),
                { status: 500 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction,
        });

        // Format history for Gemini
        const contents = [];

        if (isTextOnly) {
            // Text-only: user has described their issue. No image.
            const textPrompt = hasUserContext
                ? `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) and has described their issue:

"${textQuery.trim()}"

Analyse this description considering their stated interest. Output <thought> (1–2 sentences + confidence) then <json>.`
                : `The user has described their home maintenance issue:

"${textQuery.trim()}"

Analyse this description and provide a diagnosis. Output <thought> (1–2 sentences + confidence) then <json>.`;
            contents.push({ role: 'user', parts: [{ text: textPrompt }] });
        } else {
            const base64Data = image.split(',')[1];
            const mimeType = image.split(';')[0].split(':')[1];
            // Add the primary image as the first user message
            const imagePrompt = !history?.length
                ? hasUserContext
                    ? `The user selected "${userSelectedTrade.diagnosis}" (${userSelectedTrade.trade}) and has now uploaded this image. Analyse the image considering their interest. Output <thought> (1–2 sentences + confidence) then <json>.`
                    : 'Analyse this image. Output <thought> (1–2 sentences + confidence) then <json>.'
                : null;
            contents.push({
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType,
                        },
                    },
                    ...(imagePrompt ? [{ text: imagePrompt }] : []),
                ],
            });
        }

        const formatReminder =
            "\n\nCRITICAL: You MUST respond with <thought> then <json>. The JSON must be valid (no trailing commas, escape quotes). Put your answer in the 'message' field. Even for short questions like 'What?' or 'Are you sure?' — answer in message. If you cannot output valid JSON, use <message>Your answer</message> instead.";

        // Add history if present
        if (history && history.length > 0) {
            for (let i = 0; i < history.length; i++) {
                const msg = history[i];
                const parts: any[] = [];

                let content = msg.content || '';
                if (msg.role === 'user' && i === history.length - 1) {
                    content += formatReminder;
                }

                if (content) {
                    parts.push({ text: content });
                }

                if (msg.attachments && msg.attachments.length > 0) {
                    for (const attachment of msg.attachments) {
                        try {
                            const attBase64 = attachment.split(',')[1];
                            const attMimeType = attachment.split(';')[0].split(':')[1];
                            if (attBase64 && attMimeType) {
                                parts.push({
                                    inlineData: {
                                        data: attBase64,
                                        mimeType: attMimeType,
                                    },
                                });
                            }
                        } catch (e) {
                            console.error('Failed to parse attachment', e);
                        }
                    }
                }

                if (parts.length > 0) {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts,
                    });
                }
            }
        }

        console.log('Starting Gemini stream generation...');
        const result = await model.generateContentStream({
            contents,
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
            },
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    console.log('Awaiting first chunk from Gemini...');
                    for await (const chunk of result.stream) {
                        const text = chunk.text();
                        // console.log("Gemini chunk:", text.substring(0, 20) + "...");
                        controller.enqueue(encoder.encode(text));
                    }
                    console.log('Gemini stream completed successfully');
                } catch (e) {
                    console.error('Error during Gemini stream iteration:', e);
                    controller.error(e);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error: any) {
        console.error('Gemini Diagnosis Error:', error);
        const message =
            error?.message || error?.toString?.() || 'Failed to diagnose image';
        return new Response(
            JSON.stringify({
                error: process.env.NODE_ENV === 'development' ? message : 'Failed to diagnose image',
            }),
            { status: 500 }
        );
    }
}
