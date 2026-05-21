/**
 * Consumes POST /api/diagnose responses when {@code stream: true} is set (application/x-ndjson).
 */

export class DiagnoseStreamHttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly bodyText: string
    ) {
        super(`Diagnose request failed with HTTP ${status}`);
        this.name = 'DiagnoseStreamHttpError';
    }
}

export type ConsumeDiagnoseNdjsonOptions = {
    /** Called when the model extends the visible &lt;thought&gt; inner text (may fire often). */
    onThought: (text: string) => void;
    /** When this returns true, stops reading and returns the last complete body seen (if any). */
    isCancelled?: () => boolean;
};

/**
 * Reads newline-delimited JSON: {@code {type:'thought',text}}* } then {@code {type:'complete',full}}.
 * @returns The final processed full model text (same as non-streaming plain-text responses).
 */
export async function consumeDiagnoseNdjsonStream(
    res: Response,
    opts: ConsumeDiagnoseNdjsonOptions
): Promise<string> {
    if (!res.ok) {
        const bodyText = await res.text();
        throw new DiagnoseStreamHttpError(res.status, bodyText);
    }

    const reader = res.body?.getReader();
    if (!reader) {
        throw new Error('Diagnose stream has no body');
    }

    const decoder = new TextDecoder();
    let lineBuffer = '';
    let completeFull = '';

    try {
        while (true) {
            if (opts.isCancelled?.()) {
                break;
            }
            const { done, value } = await reader.read();
            lineBuffer += decoder.decode(value, { stream: !done });

            let newlineIndex: number;
            while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
                const line = lineBuffer.slice(0, newlineIndex).trim();
                lineBuffer = lineBuffer.slice(newlineIndex + 1);
                if (!line) continue;

                let msg: { type?: string; text?: string; full?: string };
                try {
                    msg = JSON.parse(line) as { type?: string; text?: string; full?: string };
                } catch {
                    continue;
                }

                if (msg.type === 'thought' && typeof msg.text === 'string') {
                    opts.onThought(msg.text);
                }
                if (msg.type === 'complete' && typeof msg.full === 'string') {
                    completeFull = msg.full;
                }
            }

            if (done) break;
        }
    } finally {
        reader.releaseLock();
    }

    if (!completeFull.trim()) {
        throw new Error('Diagnose stream ended without a complete payload');
    }

    return completeFull;
}

export function responseLooksLikeDiagnoseNdjson(res: Response): boolean {
    const ct = res.headers.get('content-type') || '';
    return ct.includes('ndjson');
}
