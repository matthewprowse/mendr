export const DESC =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.';

export function FeaturesChatPlaceholder({
    label,
    aspectRatio = 'aspect-video',
    className = '',
    title = '',
    description = DESC,
}: {
    label: string;
    aspectRatio?: string;
    className?: string;
    title?: string;
    description?: string;
}) {
    const aspectClass =
        aspectRatio === 'aspect-[4/3]'
            ? 'lg:aspect-[4/3]'
            : aspectRatio === 'aspect-[21/9]'
              ? 'lg:aspect-[21/9]'
              : 'lg:aspect-video';

    return (
        <div
            className={`flex flex-col rounded-lg border border-border/50 bg-secondary/50 transition-all duration-250 hover:border-border/75 hover:bg-secondary/25 max-lg:aspect-auto max-lg:min-h-[300px] ${aspectClass} ${className}`}
        >
            <div className="flex flex-1 min-h-0 items-center justify-center">
                <span className="px-2 text-center text-sm text-muted-foreground">
                    {title || label}
                </span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 rounded-b-lg border-t border-border/50 bg-white p-4">
                {title && <p className="text-sm font-medium text-foreground">{title}</p>}
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

export function FeaturesSection() {
    return (
        <section id="features" className="bg-muted/50 py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-12 text-center">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Our Features</h2>
                    <p className="mx-auto mt-4 max-w-3xl text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim
                        veniam, quis nostrud exercitation ullamco laboris.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:grid-rows-3 lg:gap-6">
                    {/* Large hero card - spans 2 cols, 2 rows on lg only */}
                    <div className="min-h-[200px] lg:col-span-2 lg:row-span-2 lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="Pre-Diagnosed Leads"
                            aspectRatio="aspect-[4/3]"
                            className="h-full min-h-[200px] w-full"
                            title="Pre-Diagnosed Leads"
                            description={DESC}
                        />
                    </div>
                    {/* Top right - 2 small cards */}
                    <div className="min-h-[180px] lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="[PLACEHOLDER: Cost Estimate UI]"
                            aspectRatio="aspect-video"
                            className="h-full min-h-[180px] w-full"
                            title="Data Privacy"
                            description={DESC}
                        />
                    </div>
                    <div className="min-h-[180px] lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="[PLACEHOLDER: Repair Report Card]"
                            aspectRatio="aspect-video"
                            className="h-full min-h-[180px] w-full"
                            title="Cost Estimates"
                            description={DESC}
                        />
                    </div>
                    {/* Wide card - spans 2 cols on lg */}
                    <div className="min-h-[160px] lg:col-span-2 lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="[PLACEHOLDER: Provider List / Match UI]"
                            aspectRatio="aspect-[21/9]"
                            className="h-full min-h-[160px] w-full"
                            title="AI Fault Diagnosis"
                            description={DESC}
                        />
                    </div>
                    {/* Bottom row - 2 medium cards */}
                    <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="[PLACEHOLDER: Share Report]"
                            aspectRatio="aspect-video"
                            className="h-full min-h-[180px] w-full"
                            title="Job Pipeline"
                            description={DESC}
                        />
                    </div>
                    <div className="min-h-[180px] lg:col-span-2 lg:min-h-0">
                        <FeaturesChatPlaceholder
                            label="[PLACEHOLDER: Local Specialists]"
                            aspectRatio="aspect-video"
                            className="h-full min-h-[180px] w-full"
                            title="WhatsApp Integration"
                            description={DESC}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
