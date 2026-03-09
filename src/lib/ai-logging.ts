type AiEndpoint = 'diagnose' | 'providers' | 'reviews-sync' | 'whatsapp';

export interface AiLogEvent {
    endpoint: AiEndpoint;
    status: 'ok' | 'error';
    durationMs: number;
    meta?: Record<string, unknown>;
}

export function logAiEvent(event: AiLogEvent): void {
    const payload = {
        type: 'ai_event',
        ts: new Date().toISOString(),
        ...event,
    };

    // Use a single structured line for easier log parsing later.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
}

