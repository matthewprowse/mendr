export function formatWeekdayDescriptionsTo24h(
    lines: unknown
): string[] | null {
    if (!Array.isArray(lines)) return null;

    const formatTimeToken = (raw: string): string | null => {
        const s = raw.trim();
        // Examples:
        // - 9:00 AM
        // - 12 PM
        // - 12:30pm
        const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([aApP][mM])$/);
        if (ampm) {
            const hour12 = Number(ampm[1]);
            const minute = ampm[2] != null ? Number(ampm[2]) : 0;
            const ap = ampm[3].toLowerCase();
            const isPm = ap === 'pm';
            const hour24 = (hour12 % 12) + (isPm ? 12 : 0);
            const hh = String(hour24).padStart(2, '0');
            const mm = String(minute).padStart(2, '0');
            return `${hh}:${mm}`;
        }

        // 24h examples:
        // - 9:00
        // - 09:00
        const plain = s.match(/^(\d{1,2})(?::(\d{2}))$/);
        if (plain) {
            const hh = String(Number(plain[1])).padStart(2, '0');
            const mm = String(Number(plain[2])).padStart(2, '0');
            return `${hh}:${mm}`;
        }

        return null;
    };

    const convertHoursPartTo24h = (hoursPart: string): string => {
        const trimmed = hoursPart.trim();
        if (!trimmed) return trimmed;

        if (/closed/i.test(trimmed)) return 'Closed';
        if (/24\s*hours/i.test(trimmed)) return 'Open 24 Hours';

        // Convert all AM/PM time tokens we see.
        // Match tokens like: "9:00 AM", "12 PM", "12:30pm"
        const timeTokenRegex = /(\d{1,2}(?::\d{2})?\s*[aApP][mM])/g;
        let converted = trimmed.replace(timeTokenRegex, (m) => {
            const t = formatTimeToken(m);
            return t ?? m;
        });

        // Normalize dash characters so downstream parsing/UI is consistent.
        converted = converted.replace(/[–—]/g, '-');

        // Normalize spacing around dashes: "08:00-17:00" -> "08:00 - 17:00"
        converted = converted.replace(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g, '$1 - $2');

        // If it still contains AM/PM, leave it as-is (likely an edge-case format we don't handle).
        return converted.trim();
    };

    const formatLine = (line: string): string => {
        const raw = line.trim();
        if (!raw) return '';

        // Typical:
        //   Monday: 9:00 AM – 5:00 PM
        //   Tue - Closed
        const m = raw.match(/^([A-Za-z]+)\s*[:\-]\s*(.+)$/);
        if (!m) return raw;
        const rawDay = m[1];
        const k = rawDay.trim().toLowerCase();
        const day =
            k.startsWith('mon')
                ? 'Monday'
                : k.startsWith('tue')
                  ? 'Tuesday'
                  : k.startsWith('wed')
                    ? 'Wednesday'
                    : k.startsWith('thu')
                      ? 'Thursday'
                      : k.startsWith('fri')
                        ? 'Friday'
                        : k.startsWith('sat')
                          ? 'Saturday'
                          : k.startsWith('sun')
                            ? 'Sunday'
                            : rawDay;
        const hoursPart = m[2];
        const hours = convertHoursPartTo24h(hoursPart);
        return `${day}: ${hours}`;
    };

    const formatted = lines
        .map((l) => (typeof l === 'string' ? formatLine(l) : ''))
        .filter(Boolean);

    return formatted.length > 0 ? formatted : null;
}

