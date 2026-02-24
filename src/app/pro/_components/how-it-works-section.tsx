import { Placeholder } from '@/components/placeholder';

const DESC =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

type PlaceholderItem = {
    label: string;
};

type RowConfig = {
    heading: string;
    description: string;
    count: 1 | 2 | 4;
    items: PlaceholderItem[];
    /** true = text left, placeholders right; false = placeholders left, text right */
    textFirst?: boolean;
};

const ROWS: RowConfig[] = [
    {
        heading: 'View Pre-Diagnosed Leads',
        description: DESC,
        count: 1,
        items: [
            {
                label:
                    '[PLACEHOLDER: Web Dashboard UI showing AI breakdown of a broken DB board and estimated repair costs]',
            },
        ],
        textFirst: true,
    },
    {
        heading: 'Accept & Review Jobs',
        description: DESC,
        count: 2,
        items: [
            { label: '[PLACEHOLDER: Lead details UI]' },
            { label: '[PLACEHOLDER: Job details UI]' },
        ],
        textFirst: false,
    },
    {
        heading: 'Manage Your Pipeline',
        description: DESC,
        count: 4,
        items: [
            { label: '[PLACEHOLDER: Dashboard card 1]' },
            { label: '[PLACEHOLDER: Dashboard card 2]' },
            { label: '[PLACEHOLDER: Dashboard card 3]' },
            { label: '[PLACEHOLDER: Dashboard card 4]' },
        ],
        textFirst: true,
    },
    {
        heading: 'Share Your Link',
        description: DESC,
        count: 1,
        items: [
            {
                label:
                    "[PLACEHOLDER: Contractor's branded WhatsApp share link and custom QR code]",
            },
        ],
        textFirst: false,
    },
    {
        heading: 'Connect via WhatsApp',
        description: DESC,
        count: 2,
        items: [
            { label: '[PLACEHOLDER: QR code mockup]' },
            { label: '[PLACEHOLDER: WhatsApp preview]' },
        ],
        textFirst: true,
    },
    {
        heading: 'Get Paid',
        description: DESC,
        count: 4,
        items: [
            { label: '[PLACEHOLDER: Completed job 1]' },
            { label: '[PLACEHOLDER: Completed job 2]' },
            { label: '[PLACEHOLDER: Completed job 3]' },
            { label: '[PLACEHOLDER: Wallet payout UI]' },
        ],
        textFirst: false,
    },
];

function PlaceholderRow({ config }: { config: RowConfig }) {
    const textCol = (
        <div className="flex flex-col justify-center space-y-4">
            <h3 className="text-xl font-semibold">{config.heading}</h3>
            <p className="text-muted-foreground">{config.description}</p>
        </div>
    );
    const placeholderGridClass =
        config.count === 1
            ? 'grid-cols-1'
            : config.count === 2
              ? 'grid-cols-2'
              : 'grid-cols-2';
    const aspectRatio = config.count === 2 ? 'aspect-[3/4]' : 'aspect-[4/3]';
    const is2x2 = config.count === 4;
    const gridWrapperClass = is2x2 ? 'max-h-[396px] grid-rows-2' : '';
    const placeholderClassName =
        is2x2 ? 'h-full min-h-0 w-full' : 'h-[396px] w-full min-h-[200px]';
    const placeholdersCol = (
        <div
            className={`grid gap-4 ${placeholderGridClass} lg:gap-6 ${gridWrapperClass}`}
        >
            {config.items.map((item, i) => (
                <Placeholder
                    key={i}
                    label={item.label}
                    aspectRatio={aspectRatio}
                    className={placeholderClassName}
                />
            ))}
        </div>
    );
    const textFirst = config.textFirst ?? true;
    return (
        <div className="grid items-center gap-8 py-8 lg:grid-cols-2 lg:gap-12">
            {textFirst ? (
                <>
                    <div className="order-2 lg:order-1">{textCol}</div>
                    <div className="order-1 lg:order-2">{placeholdersCol}</div>
                </>
            ) : (
                <>
                    <div>{placeholdersCol}</div>
                    <div>{textCol}</div>
                </>
            )}
        </div>
    );
}

export function HowItWorksSection() {
    return (
        <section
            id="how-it-works"
            className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
            <div className="mb-10 text-center">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    How Scandio Pro Works
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                    Pre-diagnosed leads delivered to your dashboard. Accept jobs, show up
                    informed, get paid. No call-out fees, no dead leads.
                </p>
            </div>

            <div className="space-y-0">
                {ROWS.map((row, i) => (
                    <PlaceholderRow key={i} config={row} />
                ))}
            </div>
        </section>
    );
}
