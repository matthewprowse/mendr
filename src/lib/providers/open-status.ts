export type OpenStatusResult = {
    isOpen: boolean | null;
    nextOpensAt?: string | null;
};

const DAY_ORDER: string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseDayName(dayRaw: string): string | null {
    const k = dayRaw.trim().toLowerCase();
    if (!k) return null;
    if (k.startsWith('sun')) return 'Sunday';
    if (k.startsWith('mon')) return 'Monday';
    if (k.startsWith('tue')) return 'Tuesday';
    if (k.startsWith('wed')) return 'Wednesday';
    if (k.startsWith('thu')) return 'Thursday';
    if (k.startsWith('fri')) return 'Friday';
    if (k.startsWith('sat')) return 'Saturday';
    return null;
}

function timeToMinutes(hhmm: string): number | null {
    const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    if (h < 0 || h > 23) return null;
    if (min < 0 || min > 59) return null;
    return h * 60 + min;
}

function parseHoursPart(hoursPartRaw: string): { kind: 'closed' | 'open24' | 'ranges'; ranges?: Array<{ start: number; end: number }> } {
    const hoursPart = hoursPartRaw.trim();
    if (!hoursPart) return { kind: 'closed' };
    if (/closed/i.test(hoursPart)) return { kind: 'closed' };
    if (/open\s*24\s*hours/i.test(hoursPart) || /24\s*hours/i.test(hoursPart)) return { kind: 'open24' };

    // Expect something like: "08:00 - 17:00"
    const normalized = hoursPart.replace(/[–—]/g, '-').replace(/\s+/g, ' ');
    const rangeRegex = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;
    const ranges: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = rangeRegex.exec(normalized)) !== null) {
        const start = timeToMinutes(match[1]);
        const end = timeToMinutes(match[2]);
        if (start == null || end == null) continue;
        ranges.push({ start, end });
    }

    if (ranges.length === 0) {
        // If we can't parse ranges, treat as closed to avoid showing "Open" incorrectly.
        return { kind: 'closed' };
    }
    return { kind: 'ranges', ranges };
}

function getWeekdayMap(weekdayDescriptions: unknown): Record<string, string> {
    if (!Array.isArray(weekdayDescriptions)) return {};
    const out: Record<string, string> = {};
    for (const line of weekdayDescriptions) {
        if (typeof line !== 'string') continue;
        const raw = line.trim();
        if (!raw) continue;
        const m = raw.match(/^([A-Za-z]+)\s*[:\-]\s*(.+)$/);
        if (!m) continue;
        const day = parseDayName(m[1]);
        if (!day) continue;
        out[day] = m[2].trim();
    }
    return out;
}

export function isOpenNowFromWeekdayDescriptions(
    weekdayDescriptions: unknown,
    now: Date
): boolean | null {
    const map = getWeekdayMap(weekdayDescriptions);
    const today = DAY_ORDER[now.getDay()];
    const hoursPart = map[today];
    if (!hoursPart) return null;

    const parsed = parseHoursPart(hoursPart);
    if (parsed.kind === 'open24') return true;
    if (parsed.kind === 'closed') return false;

    const minutesNow = now.getHours() * 60 + now.getMinutes();
    // Open if now is inside any range.
    for (const r of parsed.ranges || []) {
        if (r.start === r.end) continue;
        if (r.start < r.end) {
            if (minutesNow >= r.start && minutesNow <= r.end) return true;
        } else {
            // Overnight range, e.g. 22:00 - 02:00
            if (minutesNow >= r.start || minutesNow <= r.end) return true;
        }
    }
    return false;
}

export function getOpenStatusTextFromWeekdayDescriptions(
    weekdayDescriptions: unknown,
    now: Date
): OpenStatusResult['nextOpensAt'] extends never ? never : OpenStatusResult {
    const isOpen = isOpenNowFromWeekdayDescriptions(weekdayDescriptions, now);
    if (isOpen === true) return { isOpen: true, nextOpensAt: null };
    if (isOpen === false) {
        const map = getWeekdayMap(weekdayDescriptions);
        // Find the next opening time starting from today.
        const startIndex = now.getDay();
        for (let offset = 0; offset < 7; offset += 1) {
            const dayIndex = (startIndex + offset) % 7;
            const day = DAY_ORDER[dayIndex];
            const hoursPart = map[day];
            if (!hoursPart) continue;
            const parsed = parseHoursPart(hoursPart);
            if (parsed.kind === 'open24') {
                return { isOpen: true, nextOpensAt: null };
            }
            if (parsed.kind === 'closed') continue;
            const ranges = parsed.ranges || [];
            if (ranges.length === 0) continue;

            // Pick the first range start as the "opens at" time.
            const startMin = ranges[0].start;
            const hh = String(Math.floor(startMin / 60)).padStart(2, '0');
            const mm = String(startMin % 60).padStart(2, '0');
            return { isOpen: false, nextOpensAt: `${hh}:${mm}` };
        }
        return { isOpen: false, nextOpensAt: null };
    }
    return { isOpen: null, nextOpensAt: null };
}

