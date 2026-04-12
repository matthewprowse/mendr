import type { MarketRateSource } from './types';

/** Collapse snippets into a single block for the refinement model (no HTML). */
export function buildModelContextFromSources(sources: MarketRateSource[]): string {
    if (sources.length === 0) return '';
    const lines: string[] = [];
    let i = 1;
    for (const s of sources) {
        lines.push(`[${i}] (${s.intent}) ${s.title}`);
        lines.push(`URL: ${s.url}`);
        if (s.snippet) lines.push(s.snippet);
        lines.push('');
        i += 1;
    }
    return lines.join('\n').trim().slice(0, 12_000);
}
