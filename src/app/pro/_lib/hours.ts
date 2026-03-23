export const dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
];

export function normalizeDay(raw: string): string | null {
    const k = raw.trim().toLowerCase();
    if (!k) return null;
    if (k.startsWith('mon')) return 'Monday';
    if (k.startsWith('tue')) return 'Tuesday';
    if (k.startsWith('wed')) return 'Wednesday';
    if (k.startsWith('thu')) return 'Thursday';
    if (k.startsWith('fri')) return 'Friday';
    if (k.startsWith('sat')) return 'Saturday';
    if (k.startsWith('sun')) return 'Sunday';
    return null;
}

export function parseWeekdayDescriptions(lines: unknown): Record<string, string> {
    if (!Array.isArray(lines)) return {};
    const out: Record<string, string> = {};

    for (const lineRaw of lines) {
        if (typeof lineRaw !== 'string') continue;
        const line = lineRaw.trim();
        if (!line) continue;

        const m = line.match(/^([A-Za-z]+)\s*[:\-]\s*(.+)$/i);
        if (!m) continue;
        const rawDay = m[1] || '';
        const hours = (m[2] || '').trim();
        const day = normalizeDay(rawDay);
        if (!day || !hours) continue;
        out[day] = hours;
    }

    return out;
}
