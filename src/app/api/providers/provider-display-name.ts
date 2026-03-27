/**
 * Normalise provider display names: strip legal suffixes, marketing tails, apply title case.
 */
export function normalizeProviderName(name: string): string {
    let s = (name || '').toString().trim();
    if (!s) return s;

    const originalLower = s.toLowerCase();
    const OVERRIDES: Record<string, string> = {
        'al garage door solutions - new | repairs | automations': 'AL Garage Door Solutions',
        'planet automation (pty)': 'Planet Automation',
        'automationguru gate and garage door motor repair':
            'AutomationGURU Gate and Garage Repairs',
        'brano cape garage doors - cape town': 'Brunco Cape Garage Doors',
        'garage door repairs cbd - maintenance & motor automation installation services cape town':
            'Garage Door Repairs CBD',
    };
    if (OVERRIDES[originalLower]) {
        return OVERRIDES[originalLower];
    }

    s = s
        .replace(/\b(\(pty\)\s*ltd|pty\s*ltd|limited|ltd|inc|llc|cc)\b\.?/gi, '')
        .replace(/\s*\((pty|cc|inc|ltd)\)\s*$/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s*,\s*$/g, '')
        .trim();

    s = s.replace(/\s*-\s+.+$/, '').trim();

    s = s.replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();

    const titleCaseWord = (word: string) => {
        const raw = word.trim();
        if (!raw) return raw;

        if (/^[A-Z0-9]{2,}$/.test(raw)) return raw;

        if (/[A-Z]/.test(raw.slice(1)) && /[a-z]/.test(raw)) {
            return raw[0].toUpperCase() + raw.slice(1);
        }

        const lower = raw.toLowerCase();
        if (lower.startsWith('mc') && lower.length > 2) {
            const tail = lower.slice(2);
            return 'Mc' + tail[0].toUpperCase() + tail.slice(1);
        }
        if (lower.startsWith('mac') && lower.length > 3) {
            const tail = lower.slice(3);
            return 'Mac' + tail[0].toUpperCase() + tail.slice(1);
        }

        return lower[0].toUpperCase() + lower.slice(1);
    };

    const titleCaseToken = (token: string) => {
        const parts = token.split(/([-\/])/);
        return parts
            .map((part) => {
                if (part === '-' || part === '/' || part === '') return part;
                const apostropheParts = part.split(/(')/);
                return apostropheParts
                    .map((ap) => {
                        if (ap === "'") return ap;
                        return titleCaseWord(ap);
                    })
                    .join('');
            })
            .join('');
    };

    s = s
        .split(/\s+/g)
        .map((w) => titleCaseToken(w))
        .filter(Boolean)
        .join(' ');

    return s;
}
