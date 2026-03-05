import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ProviderDirectionsMap } from './provider-directions-map';

type ProviderAboutSectionProps = {
    name: string;
    address?: string | null;
    summary: string | null;
    /** Simple list of service/category labels to display as badges */
    services: string[];
    /** Operating hours lines like "Monday: 08:00 – 17:00" */
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

    return (
        <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
                <Card className="border-border/70 bg-card">
                    <CardHeader className="space-y-1 pb-3">
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">
                            About {name}
                        </h2>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>
                            {summary ||
                                'No description is available yet for this provider. Check back soon for more details.'}
                        </p>
                        {address && (
                            <>
                                <Separator className="my-1.5" />
                                <p className="text-xs text-muted-foreground">
                                    Based at{' '}
                                    <span className="font-medium text-foreground">
                                        {address}
                                    </span>
                                    .
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/70 bg-card">
                    <CardHeader className="space-y-1 pb-3">
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">
                            Services & coverage
                        </h2>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        {hasServices ? (
                            <div className="flex flex-wrap gap-1.5">
                                {services.map((cat) => (
                                    <Badge
                                        key={cat}
                                        variant="outline"
                                        className="text-xs font-medium"
                                    >
                                        {cat}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p>No specific service categories are listed yet.</p>
                        )}
                        {coverageDescription && (
                            <p className="text-xs text-muted-foreground">
                                {coverageDescription}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </section>

            {hasOperatingHours && (
                <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
                    <Card className="border-border/70 bg-card">
                        <CardHeader className="space-y-1 pb-3">
                            <h2 className="text-sm font-semibold tracking-tight text-foreground">
                                Operating hours
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Typical weekly schedule (may vary on holidays).
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            <ul className="space-y-1 text-xs sm:text-sm">
                                {operatingHours.map((line) => {
                                    const [day, ...rest] = line.split(':');
                                    const hours = rest.join(':').trim();
                                    return (
                                        <li
                                            key={line}
                                            className="flex items-center justify-between"
                                        >
                                            <span className="text-foreground">{day}</span>
                                            <span>{hours}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CardContent>
                    </Card>

                    {mapConfig && (
                        <ProviderDirectionsMap
                            apiKey={mapConfig.apiKey}
                            provider={mapConfig.provider}
                            mapsUrl={mapConfig.mapsUrl}
                        />
                    )}
                </section>
            )}
        </div>
    );
}

