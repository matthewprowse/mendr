import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ProviderDirectionsMap } from './provider-directions-map';

type ProviderAboutSectionProps = {
    name: string;
    address?: string | null;
    summary: string | null;
    /** Simple list of service/category labels to display as badges */
    services: string[];
    /** Operating hours lines like "Monday: 08:00 – 17:00" or Google weekday_descriptions */
    operatingHours: string[];
    /** Optional coverage description (e.g. "Serving areas around X • ~Ykm radius") */
    coverageDescription?: string | null;
    /** Optional directions map configuration; when null the map is omitted */
    mapConfig?: {
        apiKey: string;
        provider: {
            name: string;
            latitude?: number | null;
            longitude?: number | null;
            address?: string | null;
        };
        mapsUrl?: string | null;
    } | null;
};

function getOpenStatus(operatingHours: string[]): 'open' | 'closed' | 'unknown' {
    if (!Array.isArray(operatingHours) || operatingHours.length === 0) return 'unknown';

    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];

    const todayLine =
        operatingHours.find((line) => line.toLowerCase().startsWith(todayName.toLowerCase())) ??
        null;
    if (!todayLine) return 'unknown';

    const lower = todayLine.toLowerCase();
    if (lower.includes('closed')) return 'closed';
    if (lower.includes('open 24 hours')) return 'open';

    const afterColon = todayLine.split(':').slice(1).join(':');
    const hoursText = (afterColon || todayLine)
        .replace(/\u202f/g, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();

    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
    const matches = [...hoursText.matchAll(timeRegex)]
        .map((m) => ({
            h: m[1],
            m: m[2],
            mer: m[3],
            raw: m[0],
        }))
        // filter obvious non-times (e.g. "Monday" etc.)
        .filter((t) => t.raw && /\d/.test(t.raw));

    if (matches.length < 2) return 'unknown';

    const toMinutes = (h24: number, min: number) => h24 * 60 + min;
    const to24h = (h: number, mer?: string | null): number => {
        if (!mer) return h; // assume 24h input
        const m = mer.toLowerCase();
        const hh = h % 12;
        return m === 'pm' ? hh + 12 : hh;
    };

    const startH = Number(matches[0]!.h);
    const startM = Number(matches[0]!.m ?? '0');
    const endH = Number(matches[1]!.h);
    const endM = Number(matches[1]!.m ?? '0');
    if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return 'unknown';

    const startMinutes = toMinutes(to24h(startH, matches[0]!.mer), startM);
    const endMinutes = toMinutes(to24h(endH, matches[1]!.mer), endM);
    const nowMinutes = toMinutes(now.getHours(), now.getMinutes());

    if (endMinutes === startMinutes) return 'unknown';

    // handle overnight hours like 20:00–02:00
    if (endMinutes < startMinutes) {
        return nowMinutes >= startMinutes || nowMinutes <= endMinutes ? 'open' : 'closed';
    }
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes ? 'open' : 'closed';
}

export function ProviderAboutSection({
    name,
    address,
    summary,
    services,
    operatingHours,
    coverageDescription,
    mapConfig,
}: ProviderAboutSectionProps) {
    const hasServices = services.length > 0;
    const hasOperatingHours = operatingHours.length > 0;
    const openStatus = hasOperatingHours ? getOpenStatus(operatingHours) : 'unknown';

    function formatOperatingHoursLine(line: string): string {
        const raw = String(line || '').replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ').trim();
        if (!raw) return raw;
        const [day, ...rest] = raw.split(':');
        const rhs = rest.join(':').trim();
        const lower = rhs.toLowerCase();
        if (!rhs) return raw;
        if (lower.includes('closed')) return `${day}: Closed`;
        if (lower.includes('open 24 hours')) return `${day}: Open 24 hours`;

        const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
        const matches = [...rhs.matchAll(timeRegex)]
            .map((m) => ({ h: m[1], m: m[2], mer: m[3] }))
            .filter((t) => t.h);
        if (matches.length < 2) {
            // at least normalise AM/PM casing when present
            return `${day}: ${rhs.replace(/\bAM\b/g, 'am').replace(/\bPM\b/g, 'pm')}`;
        }

        const to24h = (h: number, mer?: string | null): number => {
            if (!mer) return h;
            const mm = mer.toLowerCase();
            const hh = h % 12;
            return mm === 'pm' ? hh + 12 : hh;
        };
        const to12h = (h24: number) => {
            const mer = h24 >= 12 ? 'pm' : 'am';
            const h = ((h24 + 11) % 12) + 1;
            return { h, mer };
        };

        const startH = Number(matches[0]!.h);
        const startM = Number(matches[0]!.m ?? '0');
        const endH = Number(matches[1]!.h);
        const endM = Number(matches[1]!.m ?? '0');
        if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return `${day}: ${rhs}`;

        const start24 = to24h(startH, matches[0]!.mer);
        const end24 = to24h(endH, matches[1]!.mer);
        const start12 = to12h(start24);
        const end12 = to12h(end24);

        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (t: { h: number; mer: string }, mins: number) =>
            `${t.h}:${pad(mins)} ${t.mer}`;

        return `${day}: ${fmt(start12, startM)} – ${fmt(end12, endM)}`;
    }

    return (
        <div className="space-y-6">
            {summary && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                        Summary
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {summary}
                    </p>
                </section>
            )}

            {hasServices && (
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                        Provider Services
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.
                    </p>

                    <div className="flex flex-wrap gap-2 mt-4">
                        {services.map((service) => (
                            <Badge
                                key={service}
                                variant="secondary"
                            >
                                {service}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            <Separator />

            {(hasOperatingHours || mapConfig) && (
                <section className="grid gap-6 lg:grid-cols-2">
                    {hasOperatingHours && (
                        <Card className="border-input/75 bg-card rounded-lg shadow-none">
                            <CardHeader className="space-y-1 pb-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Operating Hours
                                    </h2>
                                    {openStatus !== 'unknown' && (
                                        <Badge variant={openStatus === 'open' ? 'default' : 'outline'}>
                                            {openStatus === 'open' ? 'Open' : 'Closed'}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    View weekly operating hours.
                                </p>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3 text-sm">
                                    {operatingHours.map((line) => {
                                        const formatted = formatOperatingHoursLine(line);
                                        const [day, ...rest] = formatted.split(':');
                                        const hours = rest.join(':').trim();
                                        return (
                                            <li
                                                key={line}
                                                className="flex items-center justify-between text-muted-foreground"
                                            >
                                                <span className="font-medium text-foreground">{day}</span>
                                                <span>{hours || '—'}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {mapConfig && (
                        <div className={!hasOperatingHours ? 'lg:col-span-2' : ''}>
                            <ProviderDirectionsMap
                                apiKey={mapConfig.apiKey}
                                provider={mapConfig.provider}
                                mapsUrl={mapConfig.mapsUrl}
                            />
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
