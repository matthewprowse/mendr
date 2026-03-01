'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NextImage from 'next/image';
import { ArrowLeft } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { FavouriteButton } from '@/components/favourite-button';
import { formatBusinessName } from '@/lib/utils';

export type ProPlaceHeaderProvider = {
    name: string;
    phone: string | null;
    website: string | null;
    place_id: string;
    latitude: number | null;
    longitude: number | null;
    /** Slug for registered provider_profiles — used for favouriting */
    providerProfileSlug?: string | null;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Derives open/closed status and a human-readable label from Google's
 * weekday_descriptions array.
 * Exported so the provider-place-client can reuse it for the banner pill. (e.g. ["Monday: 8:00 AM – 5:00 PM", "Sunday: Closed"]).
 *
 * Returns:
 *   { open: true,  label: "Open · closes 5:00 PM" }
 *   { open: false, label: "Closed · opens Mon 8:00 AM" }
 *   null  — if hours data is unavailable or unparseable
 */
export function getOpenStatus(
    weekdayDescriptions: string[]
): { open: boolean; label: string } | null {
    if (!weekdayDescriptions?.length) return null;

    const now = new Date();
    const todayIdx = now.getDay(); // 0 = Sunday
    const todayName = DAY_NAMES[todayIdx];

    // Parse a single description line into { day, hoursText }
    const parsed = weekdayDescriptions.map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return null;
        const day = line.slice(0, colonIdx).trim();
        const hours = line.slice(colonIdx + 1).trim();
        return { day, hours };
    }).filter(Boolean) as Array<{ day: string; hours: string }>;

    if (!parsed.length) return null;

    // Find today's entry
    const todayEntry = parsed.find((p) => p.day === todayName);
    if (!todayEntry) return null;

    const hours = todayEntry.hours;

    // Closed all day
    if (/closed/i.test(hours)) {
        // Find next day that's open
        for (let offset = 1; offset <= 7; offset++) {
            const nextIdx = (todayIdx + offset) % 7;
            const nextName = DAY_NAMES[nextIdx];
            const nextEntry = parsed.find((p) => p.day === nextName);
            if (nextEntry && !/closed/i.test(nextEntry.hours)) {
                // Extract opening time — take everything before the dash/en-dash
                const openTime = nextEntry.hours.split(/[–-]/)[0].trim().replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
                const label =
                    offset === 1
                        ? `Closed · Opens tomorrow ${openTime}`
                        : `Closed · Opens ${nextName.slice(0, 3)} ${openTime}`;
                return { open: false, label };
            }
        }
        return { open: false, label: 'Closed today' };
    }

    // Hours like "8:00 AM – 5:00 PM" or "Open 24 hours"
    if (/24 hours/i.test(hours)) {
        return { open: true, label: 'Open · 24 hours' };
    }

    // Parse time range — split on en-dash, em-dash, or plain hyphen
    const parts = hours.split(/\s*[–—-]\s*/);
    if (parts.length < 2) {
        // Can't determine range — just say open
        return { open: true, label: `Open · ${hours}` };
    }

    const fmtTime = (t: string) => t.replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());

    const openStr = fmtTime(parts[0].trim());
    const closeStr = fmtTime(parts[parts.length - 1].trim());

    /** Convert "8:00 AM" / "5:00 PM" to a Date on today's date */
    const parseTime = (timeStr: string): Date | null => {
        // Handle formats: "8:00 AM", "08:00", "8 AM", etc.
        const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = m[2] ? parseInt(m[2], 10) : 0;
        const period = m[3]?.toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        const d = new Date(now);
        d.setHours(h, min, 0, 0);
        return d;
    };

    const openTime = parseTime(openStr);
    const closeTime = parseTime(closeStr);

    if (!openTime || !closeTime) {
        return { open: true, label: `Open · ${hours}` };
    }

    // If closing time is before opening time it spans midnight — adjust
    if (closeTime <= openTime) {
        closeTime.setDate(closeTime.getDate() + 1);
    }

    if (now >= openTime && now < closeTime) {
        return { open: true, label: `Open · Closes at ${closeStr}` };
    }

    if (now < openTime) {
        return { open: false, label: `Closed · Opens at ${openStr}` };
    }

    // Past closing time — find next opening
    for (let offset = 1; offset <= 7; offset++) {
        const nextIdx = (todayIdx + offset) % 7;
        const nextName = DAY_NAMES[nextIdx];
        const nextEntry = parsed.find((p) => p.day === nextName);
        if (nextEntry && !/closed/i.test(nextEntry.hours)) {
            const nextOpen = nextEntry.hours.split(/\s*[–—-]\s*/)[0].trim().replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
            const label =
                offset === 1
                    ? `Closed · Opens tomorrow ${nextOpen}`
                    : `Closed · Opens ${nextName.slice(0, 3)} ${nextOpen}`;
            return { open: false, label };
        }
    }

    return { open: false, label: 'Closed now' };
}

export function ProPlaceHeader({
    provider,
    mapsUrl: _mapsUrl,
}: {
    provider: ProPlaceHeaderProvider;
    mapsUrl: string;
    weekdayDescriptions?: string[] | null;
}) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Left — back + logo + Scandio (match Chat AppHeader) */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="-ml-2 text-muted-foreground hover:text-foreground"
                        aria-label="Go back"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="size-4" />
                    </Button>
                    <Link href="/" className="flex items-center gap-2">
                        <NextImage
                            src="/logo.svg"
                            alt="Scandio"
                            width={36}
                            height={36}
                            className="h-9 w-9 shrink-0 rounded-lg"
                        />
                        <span className="font-semibold">Scandio</span>
                    </Link>
                </div>

                {/* Right — heart only (no Join Pro Network, no avatar) */}
                <div className="flex items-center gap-2">
                    <FavouriteButton
                        placeId={provider.place_id}
                        providerProfileSlug={provider.providerProfileSlug}
                        providerName={formatBusinessName(provider.name)}
                        variant="icon"
                    />
                </div>
            </div>
        </header>
    );
}
