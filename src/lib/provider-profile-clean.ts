function decodeCommonEntities(text: string): string {
    return text
        .replace(/&#0*38;|&amp;/gi, '&')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&#0*34;|&quot;/gi, '"')
        .replace(/&#0*8211;|&ndash;/gi, '-')
        .replace(/&#0*8212;|&mdash;/gi, '-')
        .replace(/&#0*8216;|&#0*8217;/gi, "'")
        .replace(/&#0*8220;|&#0*8221;/gi, '"')
        .replace(/&#0*160;|&nbsp;/gi, ' ');
}

export function sanitizeProfileText(input: string | null | undefined): string {
    if (!input) return '';

    const withDecodedEntities = decodeCommonEntities(input)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r/g, '\n');

    const rawLines = withDecodedEntities
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const tagOnlyOrSuffix = /\b(?:div|li|ul|ol|p|span|h[1-6]|section|article|footer|header|nav)\b$/i;
    const pureTag = /^(?:div|li|ul|ol|p|span|h[1-6]|section|article|footer|header|nav)$/i;
    const cookieNoise =
        /(cookie settings|manage consent|privacy overview|accept all|necessary cookies|gdpr|this website uses cookies)/i;

    const cleanedLines = rawLines.filter((line) => {
        if (pureTag.test(line)) return false;
        if (cookieNoise.test(line)) return false;
        if (line.length < 3) return false;
        if (tagOnlyOrSuffix.test(line) && line.split(' ').length <= 5) return false;
        return true;
    });

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const line of cleanedLines) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(line);
    }

    return deduped.join('\n').slice(0, 1800).trim();
}

export function isLowSignalProfileText(text: string): boolean {
    if (!text) return true;
    const lowered = text.toLowerCase();
    const markerMatches = lowered.match(/\b(div|li|ul|ol|h[1-6]|cookie|privacy overview)\b/g) ?? [];
    const words = lowered.split(/\s+/).filter(Boolean);
    const markerRatio = words.length > 0 ? markerMatches.length / words.length : 1;
    return markerMatches.length >= 10 || markerRatio > 0.12;
}

export function normalizeProfileTextForStorage(input: string | null | undefined): string | null {
    const cleaned = sanitizeProfileText(input);
    if (!cleaned) return null;
    if (isLowSignalProfileText(cleaned)) return null;
    return cleaned;
}

