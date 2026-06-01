"use client";

import * as React from "react";
import {
    AtSign,
    Bell,
    Calendar as CalendarIcon,
    Check,
    ChevronDown,
    ChevronRight,
    CreditCard,
    Heart,
    Home,
    LifeBuoy,
    Mail,
    MoreHorizontal,
    Plus,
    Search,
    Settings,
    Share2,
    Slash,
    Star,
    Trash2,
    User,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { toast, Toaster } from "sonner";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupText,
} from "@/components/ui/input-group";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp";
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemSeparator,
    ItemTitle,
} from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarShortcut,
    MenubarTrigger,
} from "@/components/ui/menubar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Community / Dice UI ─────────────────────────── */
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Rating, RatingItem } from "@/components/ui/rating";
import {
    Stepper,
    StepperIndicator,
    StepperItem,
    StepperList,
    StepperNext,
    StepperPrev,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "@/components/ui/stepper";

const chartData = [
    { month: "Jan", jobs: 12 },
    { month: "Feb", jobs: 18 },
    { month: "Mar", jobs: 9 },
    { month: "Apr", jobs: 24 },
    { month: "May", jobs: 21 },
];

const chartConfig = {
    jobs: { label: "Jobs", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function ShowcasePage() {
    const [progress, setProgress] = React.useState(45);
    const [date, setDate] = React.useState<Date | undefined>(new Date());

    return (
        <TooltipProvider delayDuration={150}>
            <main className="mx-auto max-w-3xl px-6 py-16">
                <header className="mb-14">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Mendr · design baseline
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Every shadcn component
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Stock shadcn / new-york, neutral palette. Every primitive
                        below was installed via the CLI without modification.
                    </p>
                </header>

                {/* ─── FOUNDATIONS ─────────────────────────────────────── */}
                <Group title="Foundations">
                    <Section title="Typography — font family">
                        <p className="text-sm text-muted-foreground">
                            Product font: <strong>Anthropic Sans Text</strong>,
                            self-hosted as 6 OTF weights from{" "}
                            <code>/public/fonts/</code>. Wired in{" "}
                            <code>globals.css</code> via <code>@font-face</code>{" "}
                            and exposed as <code>--font-sans</code> through{" "}
                            <code>@theme inline</code>.
                        </p>
                    </Section>

                    <Section title="Font weights">
                        <div className="space-y-2">
                            {[
                                ["Light", 300],
                                ["Regular", 400],
                                ["Medium", 500],
                                ["Semibold", 600],
                                ["Bold", 700],
                                ["Extrabold", 800],
                            ].map(([name, w]) => (
                                <div key={w} className="flex items-baseline gap-4">
                                    <code className="w-28 text-xs text-muted-foreground">
                                        {name} · {w}
                                    </code>
                                    <p className="text-xl" style={{ fontWeight: w as number }}>
                                        Diagnose first.
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Heading scale">
                        <div className="space-y-4">
                            <TypeRow caption="Display · text-6xl · semibold · tracking-tight">
                                <p className="text-6xl font-semibold tracking-tight">
                                    Diagnose first.
                                </p>
                            </TypeRow>
                            <TypeRow caption="H1 · text-5xl · semibold">
                                <h1 className="text-5xl font-semibold tracking-tight">
                                    Something broken at home?
                                </h1>
                            </TypeRow>
                            <TypeRow caption="H2 · text-4xl · semibold">
                                <h2 className="text-4xl font-semibold tracking-tight">
                                    A clear written diagnosis.
                                </h2>
                            </TypeRow>
                            <TypeRow caption="H3 · text-3xl · semibold">
                                <h3 className="text-3xl font-semibold tracking-tight">
                                    Connect with a vetted contractor.
                                </h3>
                            </TypeRow>
                            <TypeRow caption="H4 · text-2xl · medium">
                                <h4 className="text-2xl font-medium">
                                    Section heading
                                </h4>
                            </TypeRow>
                            <TypeRow caption="H5 · text-xl · medium">
                                <h5 className="text-xl font-medium">
                                    Subheading
                                </h5>
                            </TypeRow>
                            <TypeRow caption="H6 · text-lg · medium">
                                <h6 className="text-lg font-medium">
                                    Minor heading
                                </h6>
                            </TypeRow>
                        </div>
                    </Section>

                    <Section title="Body scale">
                        <div className="space-y-4">
                            <TypeRow caption="text-xl · 20px · lead">
                                <p className="text-xl">
                                    Upload a photo, describe the problem, and
                                    we&apos;ll find the right contractor.
                                </p>
                            </TypeRow>
                            <TypeRow caption="text-lg · 18px">
                                <p className="text-lg">
                                    A relaxed introductory sentence that sets
                                    the tone for the section below.
                                </p>
                            </TypeRow>
                            <TypeRow caption="text-base · 16px · default body">
                                <p>
                                    Body copy at 16px with comfortable
                                    line-height for paragraphs of any length.
                                    This is the size used for most marketing
                                    body copy and form descriptions.
                                </p>
                            </TypeRow>
                            <TypeRow caption="text-sm · 14px · helper text">
                                <p className="text-sm">
                                    Supporting helper text, table cells,
                                    descriptions under form fields.
                                </p>
                            </TypeRow>
                            <TypeRow caption="text-xs · 12px · captions / meta">
                                <p className="text-xs text-muted-foreground">
                                    Captions, timestamps, fine print metadata.
                                </p>
                            </TypeRow>
                            <TypeRow caption="text-[10px] · eyebrow label · uppercase tracking-widest">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Section eyebrow
                                </p>
                            </TypeRow>
                        </div>
                    </Section>

                    <Section title="Leading (line-height)">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                ["leading-tight", "leading-tight"],
                                ["leading-snug", "leading-snug"],
                                ["leading-normal", "leading-normal"],
                                ["leading-relaxed", "leading-relaxed"],
                            ].map(([name, cls]) => (
                                <div key={name}>
                                    <Caption>{name}</Caption>
                                    <p className={`text-sm ${cls}`}>
                                        Upload a photo of the fault. We&apos;ll
                                        write a clear diagnosis report and find
                                        contractors who can fix it.
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Letter-spacing (tracking)">
                        <div className="space-y-2">
                            {[
                                ["tracking-tighter", "tracking-tighter"],
                                ["tracking-tight", "tracking-tight"],
                                ["tracking-normal", "tracking-normal"],
                                ["tracking-wide", "tracking-wide"],
                                ["tracking-widest · uppercase", "tracking-widest uppercase"],
                            ].map(([name, cls]) => (
                                <div key={name} className="flex items-baseline gap-4">
                                    <code className="w-44 text-xs text-muted-foreground">
                                        {name}
                                    </code>
                                    <p className={`text-base ${cls}`}>
                                        Diagnose first
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Inline elements">
                        <div className="space-y-3 text-sm">
                            <p>
                                <strong>Strong / bold</strong> emphasises a key
                                word inside running copy.
                            </p>
                            <p>
                                <em>Italic / em</em> sets off a phrase or a
                                proper noun.
                            </p>
                            <p>
                                Inline{" "}
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                    code
                                </code>{" "}
                                stands out from prose.
                            </p>
                            <p>
                                Use keyboard <Kbd>⌘</Kbd> <Kbd>K</Kbd> to open
                                the command palette.
                            </p>
                            <p>
                                <a href="#" className="underline underline-offset-4 hover:text-primary">
                                    Inline links
                                </a>{" "}
                                use an underline with a subtle offset.
                            </p>
                            <p>
                                <mark className="rounded bg-yellow-200/60 px-1 dark:bg-yellow-500/20">
                                    Highlighted phrases
                                </mark>{" "}
                                via the native <code>&lt;mark&gt;</code> element.
                            </p>
                            <p>
                                Abbreviations like{" "}
                                <abbr
                                    title="Heating, Ventilation, and Air Conditioning"
                                    className="cursor-help underline decoration-dotted underline-offset-4"
                                >
                                    HVAC
                                </abbr>{" "}
                                expose a tooltip on hover.
                            </p>
                            <p>
                                <small className="text-xs text-muted-foreground">
                                    Fine print — terms apply, beta product, etc.
                                </small>
                            </p>
                        </div>
                    </Section>

                    <Section title="Lists">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <div>
                                <Caption>Unordered</Caption>
                                <ul className="ml-5 list-disc space-y-1 text-sm">
                                    <li>Upload a photo</li>
                                    <li>Describe the problem</li>
                                    <li>Get a diagnosis</li>
                                </ul>
                            </div>
                            <div>
                                <Caption>Ordered</Caption>
                                <ol className="ml-5 list-decimal space-y-1 text-sm">
                                    <li>Take a clear photo</li>
                                    <li>Describe in your own words</li>
                                    <li>Review the report</li>
                                </ol>
                            </div>
                            <div>
                                <Caption>Definition</Caption>
                                <dl className="space-y-2 text-sm">
                                    <div>
                                        <dt className="font-medium">Diagnosis</dt>
                                        <dd className="text-muted-foreground">
                                            Written report explaining the fault.
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="font-medium">Match</dt>
                                        <dd className="text-muted-foreground">
                                            Vetted contractor recommendation.
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </Section>

                    <Section title="Blockquote · HR">
                        <blockquote className="border-l-2 pl-4 italic text-muted-foreground">
                            &ldquo;The diagnosis tool saved us a callout
                            fee.&rdquo;
                            <footer className="mt-1 text-xs not-italic text-muted-foreground">
                                — Sarah, Newlands
                            </footer>
                        </blockquote>
                        <hr className="my-4 border-border" />
                        <p className="text-sm text-muted-foreground">
                            Horizontal rule above. Use sparingly.
                        </p>
                    </Section>

                    <Section title="Prose example">
                        <article className="space-y-4 text-base leading-relaxed">
                            <h3 className="text-2xl font-semibold tracking-tight">
                                What we found in your photos
                            </h3>
                            <p>
                                Your geyser is leaking from the pressure relief
                                valve at the top of the tank. This is one of the
                                most common geyser faults in the Western Cape
                                and is usually a quick fix.
                            </p>
                            <p>
                                Left untreated, the leak can damage the ceiling
                                below and shorten the lifespan of the heating
                                element.{" "}
                                <strong>
                                    We&apos;d recommend booking a plumber within
                                    the next 48 hours.
                                </strong>
                            </p>
                        </article>
                    </Section>

                    <Section title="Spacing scale">
                        <p className="mb-4 text-sm text-muted-foreground">
                            Tailwind&apos;s 4px base.
                        </p>
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                                <div
                                    key={n}
                                    className="flex items-center gap-4 text-sm"
                                >
                                    <code className="w-20 text-muted-foreground">
                                        space-{n}
                                    </code>
                                    <span className="w-16 text-muted-foreground">
                                        {n * 4}px
                                    </span>
                                    <div
                                        className="h-3 rounded-sm bg-foreground"
                                        style={{ width: n * 4 }}
                                    />
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Colour tokens">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Swatch name="background" cls="bg-background border" />
                            <Swatch name="foreground" cls="bg-foreground" />
                            <Swatch name="primary" cls="bg-primary" />
                            <Swatch name="secondary" cls="bg-secondary border" />
                            <Swatch name="muted" cls="bg-muted border" />
                            <Swatch name="accent" cls="bg-accent border" />
                            <Swatch name="border" cls="bg-border" />
                            <Swatch name="destructive" cls="bg-destructive" />
                        </div>
                    </Section>
                </Group>

                {/* ─── FORM CONTROLS ───────────────────────────────────── */}
                <Group title="Form controls">
                    <Section title="Button">
                        <div className="flex flex-wrap gap-3">
                            <Button>Default</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="destructive">Destructive</Button>
                            <Button variant="outline">Outline</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="link">Link</Button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button size="sm">Small</Button>
                            <Button>Default</Button>
                            <Button size="lg">Large</Button>
                            <Button size="icon" aria-label="Add">
                                <Plus />
                            </Button>
                            <Button disabled>Disabled</Button>
                            <Button>
                                <Check /> With icon
                            </Button>
                        </div>
                    </Section>

                    <Section title="Button group">
                        <ButtonGroup>
                            <Button variant="outline">Day</Button>
                            <Button variant="outline">Week</Button>
                            <Button variant="outline">Month</Button>
                        </ButtonGroup>
                        <div className="mt-3">
                            <ButtonGroup>
                                <Button variant="outline" size="icon" aria-label="Bold">
                                    <strong>B</strong>
                                </Button>
                                <Button variant="outline" size="icon" aria-label="Italic">
                                    <em>I</em>
                                </Button>
                                <ButtonGroupSeparator />
                                <Button variant="outline" size="icon" aria-label="Share">
                                    <Share2 />
                                </Button>
                            </ButtonGroup>
                        </div>
                    </Section>

                    <Section title="Toggle & toggle group">
                        <div className="flex flex-wrap items-center gap-3">
                            <Toggle aria-label="Toggle bold">
                                <strong>B</strong>
                            </Toggle>
                            <Toggle aria-label="Toggle italic" pressed>
                                <em>I</em>
                            </Toggle>
                            <Toggle aria-label="Toggle underline" variant="outline">
                                <span className="underline">U</span>
                            </Toggle>
                        </div>
                        <div className="mt-3">
                            <ToggleGroup type="single" defaultValue="center">
                                <ToggleGroupItem value="left">Left</ToggleGroupItem>
                                <ToggleGroupItem value="center">Center</ToggleGroupItem>
                                <ToggleGroupItem value="right">Right</ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                    </Section>

                    <Section title="Badge">
                        <div className="flex flex-wrap gap-2">
                            <Badge>Default</Badge>
                            <Badge variant="secondary">Secondary</Badge>
                            <Badge variant="destructive">Destructive</Badge>
                            <Badge variant="outline">Outline</Badge>
                        </div>
                    </Section>

                    <Section title="Input, Textarea & Label">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="email-a">Email</Label>
                                <Input id="email-a" type="email" placeholder="you@example.com" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone-a">Phone</Label>
                                <Input id="phone-a" placeholder="+27 …" />
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            <Label htmlFor="message-a">Message</Label>
                            <Textarea id="message-a" placeholder="What's happening, when did it start…" />
                        </div>
                    </Section>

                    <Section title="Input group (addons)">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <InputGroup>
                                <InputGroupAddon>
                                    <AtSign />
                                </InputGroupAddon>
                                <InputGroupInput placeholder="username" />
                            </InputGroup>
                            <InputGroup>
                                <InputGroupAddon>
                                    <InputGroupText>R</InputGroupText>
                                </InputGroupAddon>
                                <InputGroupInput placeholder="0.00" />
                                <InputGroupAddon align="inline-end">
                                    <InputGroupText>ZAR</InputGroupText>
                                </InputGroupAddon>
                            </InputGroup>
                        </div>
                    </Section>

                    <Section title="Input OTP">
                        <InputOTP maxLength={6}>
                            <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                            </InputOTPGroup>
                            <InputOTPSeparator />
                            <InputOTPGroup>
                                <InputOTPSlot index={3} />
                                <InputOTPSlot index={4} />
                                <InputOTPSlot index={5} />
                            </InputOTPGroup>
                        </InputOTP>
                    </Section>

                    <Section title="Field (structured form field)">
                        <FieldSet>
                            <FieldLegend>Contact</FieldLegend>
                            <FieldGroup>
                                <Field>
                                    <FieldLabel htmlFor="field-name">Full name</FieldLabel>
                                    <Input id="field-name" placeholder="Matthew Prowse" />
                                    <FieldDescription>
                                        Use the name on your invoice.
                                    </FieldDescription>
                                </Field>
                                <Field data-invalid="true">
                                    <FieldLabel htmlFor="field-email">Email</FieldLabel>
                                    <Input id="field-email" defaultValue="not-an-email" aria-invalid />
                                    <FieldError>Enter a valid email address.</FieldError>
                                </Field>
                            </FieldGroup>
                        </FieldSet>
                    </Section>

                    <Section title="Select (custom) & native select">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="trade">Trade (custom Select)</Label>
                                <Select>
                                    <SelectTrigger id="trade" className="w-full">
                                        <SelectValue placeholder="Choose a trade…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="plumbing">Plumbing</SelectItem>
                                        <SelectItem value="electrical">Electrical</SelectItem>
                                        <SelectItem value="roofing">Roofing</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="urgency">Urgency (NativeSelect)</Label>
                                <NativeSelect id="urgency" defaultValue="standard">
                                    <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
                                    <NativeSelectOption value="standard">Standard</NativeSelectOption>
                                    <NativeSelectOption value="planned">Planned</NativeSelectOption>
                                </NativeSelect>
                            </div>
                        </div>
                    </Section>

                    <Section title="Checkbox, Radio & Switch">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <div className="space-y-3">
                                <Caption>Checkbox</Caption>
                                <div className="flex items-center gap-2">
                                    <Checkbox id="terms" defaultChecked />
                                    <Label htmlFor="terms">Accept terms</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox id="news" />
                                    <Label htmlFor="news">Send updates</Label>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Caption>Radio</Caption>
                                <RadioGroup defaultValue="r1">
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem value="r1" id="r1" />
                                        <Label htmlFor="r1">Homeowner</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem value="r2" id="r2" />
                                        <Label htmlFor="r2">Tenant</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-3">
                                <Caption>Switch</Caption>
                                <div className="flex items-center gap-2">
                                    <Switch id="notify" defaultChecked />
                                    <Label htmlFor="notify">Email report</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch id="sms" />
                                    <Label htmlFor="sms">SMS updates</Label>
                                </div>
                            </div>
                        </div>
                    </Section>

                    <Section title="Slider, Progress & Spinner">
                        <div className="space-y-6">
                            <div className="grid gap-3">
                                <div className="flex items-center justify-between">
                                    <Label>Budget cap</Label>
                                    <span className="text-sm text-muted-foreground">R 3 500</span>
                                </div>
                                <Slider defaultValue={[35]} max={100} step={1} />
                            </div>
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label>Diagnosis progress</Label>
                                    <span className="text-sm text-muted-foreground">{progress}%</span>
                                </div>
                                <Progress value={progress} />
                                <div className="flex gap-2 pt-1">
                                    <Button size="sm" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 10))}>
                                        −10
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 10))}>
                                        +10
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Spinner /> <span>Loading…</span>
                            </div>
                        </div>
                    </Section>
                </Group>

                {/* ─── NAVIGATION ──────────────────────────────────────── */}
                <Group title="Navigation">
                    <Section title="Tabs — default variant">
                        <Tabs defaultValue="account">
                            <TabsList>
                                <TabsTrigger value="account">Account</TabsTrigger>
                                <TabsTrigger value="password">Password</TabsTrigger>
                                <TabsTrigger value="team">Team</TabsTrigger>
                            </TabsList>
                            <TabsContent value="account" className="pt-3 text-sm">
                                Account settings panel.
                            </TabsContent>
                            <TabsContent value="password" className="pt-3 text-sm">
                                Password panel.
                            </TabsContent>
                            <TabsContent value="team" className="pt-3 text-sm">
                                Team panel.
                            </TabsContent>
                        </Tabs>
                    </Section>

                    <Section title="Tabs — line variant">
                        <Tabs defaultValue="overview">
                            <TabsList variant="line">
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                                <TabsTrigger value="reports">Reports</TabsTrigger>
                            </TabsList>
                            <TabsContent value="overview" className="pt-3 text-sm">
                                Overview content.
                            </TabsContent>
                            <TabsContent value="analytics" className="pt-3 text-sm">
                                Analytics content.
                            </TabsContent>
                            <TabsContent value="reports" className="pt-3 text-sm">
                                Reports content.
                            </TabsContent>
                        </Tabs>
                    </Section>

                    <Section title="Breadcrumb">
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbLink href="#">
                                        <Home className="size-4" />
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator>
                                    <Slash />
                                </BreadcrumbSeparator>
                                <BreadcrumbItem>
                                    <BreadcrumbLink href="#">Diagnoses</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator>
                                    <Slash />
                                </BreadcrumbSeparator>
                                <BreadcrumbItem>
                                    <BreadcrumbPage>MND-1042</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </Section>

                    <Section title="Pagination">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious href="#" />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationLink href="#">1</PaginationLink>
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationLink href="#" isActive>
                                        2
                                    </PaginationLink>
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationLink href="#">3</PaginationLink>
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext href="#" />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </Section>

                    <Section title="Navigation menu">
                        <NavigationMenu>
                            <NavigationMenuList>
                                <NavigationMenuItem>
                                    <NavigationMenuTrigger>Diagnose</NavigationMenuTrigger>
                                    <NavigationMenuContent>
                                        <ul className="grid w-[280px] gap-1 p-2">
                                            <li>
                                                <NavigationMenuLink className="block rounded-md p-2 hover:bg-accent">
                                                    Plumbing
                                                </NavigationMenuLink>
                                            </li>
                                            <li>
                                                <NavigationMenuLink className="block rounded-md p-2 hover:bg-accent">
                                                    Electrical
                                                </NavigationMenuLink>
                                            </li>
                                            <li>
                                                <NavigationMenuLink className="block rounded-md p-2 hover:bg-accent">
                                                    Roofing
                                                </NavigationMenuLink>
                                            </li>
                                        </ul>
                                    </NavigationMenuContent>
                                </NavigationMenuItem>
                                <NavigationMenuItem>
                                    <NavigationMenuLink
                                        className={navigationMenuTriggerStyle()}
                                        href="#"
                                    >
                                        Contractors
                                    </NavigationMenuLink>
                                </NavigationMenuItem>
                                <NavigationMenuItem>
                                    <NavigationMenuLink
                                        className={navigationMenuTriggerStyle()}
                                        href="#"
                                    >
                                        Pricing
                                    </NavigationMenuLink>
                                </NavigationMenuItem>
                            </NavigationMenuList>
                        </NavigationMenu>
                    </Section>

                    <Section title="Menubar">
                        <Menubar>
                            <MenubarMenu>
                                <MenubarTrigger>File</MenubarTrigger>
                                <MenubarContent>
                                    <MenubarItem>
                                        New diagnosis <MenubarShortcut>⌘N</MenubarShortcut>
                                    </MenubarItem>
                                    <MenubarItem>
                                        Open… <MenubarShortcut>⌘O</MenubarShortcut>
                                    </MenubarItem>
                                    <MenubarSeparator />
                                    <MenubarItem>Export PDF</MenubarItem>
                                </MenubarContent>
                            </MenubarMenu>
                            <MenubarMenu>
                                <MenubarTrigger>Edit</MenubarTrigger>
                                <MenubarContent>
                                    <MenubarItem>Undo</MenubarItem>
                                    <MenubarItem>Redo</MenubarItem>
                                </MenubarContent>
                            </MenubarMenu>
                            <MenubarMenu>
                                <MenubarTrigger>Help</MenubarTrigger>
                                <MenubarContent>
                                    <MenubarItem>Documentation</MenubarItem>
                                </MenubarContent>
                            </MenubarMenu>
                        </Menubar>
                    </Section>
                </Group>

                {/* ─── DATA DISPLAY ────────────────────────────────────── */}
                <Group title="Data display">
                    <Section title="Card">
                        <Card>
                            <CardHeader>
                                <CardTitle>Geyser leak — bathroom ceiling</CardTitle>
                                <CardDescription>
                                    Likely a failed pressure relief valve. Est.
                                    R 2 500 – R 4 800.
                                </CardDescription>
                                <CardAction>
                                    <Button size="sm" variant="ghost">
                                        <Check />
                                    </Button>
                                </CardAction>
                            </CardHeader>
                            <CardContent className="text-sm">
                                Three plumbers in Newlands are available this week.
                            </CardContent>
                            <CardFooter className="gap-2">
                                <Button size="sm">View matches</Button>
                                <Button size="sm" variant="outline">Edit</Button>
                            </CardFooter>
                        </Card>
                    </Section>

                    <Section title="Item (list primitive)">
                        <ItemGroup>
                            <Item>
                                <ItemMedia>
                                    <Avatar>
                                        <AvatarFallback>JD</AvatarFallback>
                                    </Avatar>
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle>Jacob Daniels</ItemTitle>
                                    <ItemDescription>
                                        Plumber · Newlands · 4.8 ★
                                    </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                    <Button size="sm">Contact</Button>
                                </ItemActions>
                            </Item>
                            <ItemSeparator />
                            <Item>
                                <ItemMedia>
                                    <Avatar>
                                        <AvatarFallback>SM</AvatarFallback>
                                    </Avatar>
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle>Sarah Mokoena</ItemTitle>
                                    <ItemDescription>
                                        Electrician · Woodstock · 4.9 ★
                                    </ItemDescription>
                                </ItemContent>
                                <ItemActions>
                                    <Button size="sm">Contact</Button>
                                </ItemActions>
                            </Item>
                        </ItemGroup>
                    </Section>

                    <Section title="Avatar">
                        <div className="flex items-center gap-3">
                            <Avatar>
                                <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                                <AvatarFallback>SC</AvatarFallback>
                            </Avatar>
                            <Avatar>
                                <AvatarFallback>MP</AvatarFallback>
                            </Avatar>
                            <Avatar className="size-10">
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar>
                        </div>
                    </Section>

                    <Section title="Kbd (keyboard keys)">
                        <p className="text-sm">
                            Press{" "}
                            <KbdGroup>
                                <Kbd>⌘</Kbd>
                                <Kbd>K</Kbd>
                            </KbdGroup>{" "}
                            to open the command palette. Quit with <Kbd>Esc</Kbd>.
                        </p>
                    </Section>

                    <Section title="Table">
                        <Table>
                            <TableCaption>Recent diagnoses</TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Trade</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">MND-1042</TableCell>
                                    <TableCell>Plumbing</TableCell>
                                    <TableCell><Badge>Matched</Badge></TableCell>
                                    <TableCell className="text-right">R 850</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">MND-1043</TableCell>
                                    <TableCell>Electrical</TableCell>
                                    <TableCell><Badge variant="secondary">Pending</Badge></TableCell>
                                    <TableCell className="text-right">R 1 200</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">MND-1044</TableCell>
                                    <TableCell>Roofing</TableCell>
                                    <TableCell><Badge variant="outline">Quoted</Badge></TableCell>
                                    <TableCell className="text-right">R 3 400</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Section>

                    <Section title="Chart">
                        <ChartContainer config={chartConfig} className="h-56 w-full">
                            <BarChart data={chartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="jobs" fill="var(--color-jobs)" radius={6} />
                            </BarChart>
                        </ChartContainer>
                    </Section>

                    <Section title="Accordion">
                        <Accordion type="single" collapsible defaultValue="a-1">
                            <AccordionItem value="a-1">
                                <AccordionTrigger>
                                    What does a diagnosis cost?
                                </AccordionTrigger>
                                <AccordionContent>
                                    A written diagnosis is free during beta.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="a-2">
                                <AccordionTrigger>
                                    How fast will I get matched?
                                </AccordionTrigger>
                                <AccordionContent>
                                    Most homeowners are matched within an hour.
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </Section>

                    <Section title="Collapsible">
                        <Collapsible className="rounded-md border p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">
                                        Advanced options
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Filters, model overrides, debug.
                                    </div>
                                </div>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        Toggle <ChevronDown />
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent className="mt-3 space-y-2 text-sm text-muted-foreground">
                                <div>· Model: gemini-2.5-pro</div>
                                <div>· Max images per diagnosis: 6</div>
                                <div>· Verbose logging</div>
                            </CollapsibleContent>
                        </Collapsible>
                    </Section>

                    <Section title="Carousel">
                        <Carousel className="w-full max-w-md">
                            <CarouselContent>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <CarouselItem key={n} className="basis-1/3">
                                        <div className="flex aspect-square items-center justify-center rounded-md border bg-muted text-3xl font-medium">
                                            {n}
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious />
                            <CarouselNext />
                        </Carousel>
                    </Section>

                    <Section title="Calendar">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            className="rounded-md border w-fit"
                        />
                    </Section>

                    <Section title="Aspect ratio">
                        <div className="max-w-sm">
                            <AspectRatio ratio={16 / 9} className="rounded-md bg-muted">
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    16:9 placeholder
                                </div>
                            </AspectRatio>
                        </div>
                    </Section>

                    <Section title="Scroll area">
                        <ScrollArea className="h-40 w-full rounded-md border p-3 text-sm">
                            <div className="space-y-2">
                                {Array.from({ length: 20 }, (_, i) => (
                                    <p key={i}>Line {i + 1} — long content scrolls inside.</p>
                                ))}
                            </div>
                        </ScrollArea>
                    </Section>

                    <Section title="Skeleton">
                        <div className="flex items-center gap-4">
                            <Skeleton className="size-12 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </div>
                    </Section>

                    <Section title="Empty state">
                        <Empty className="rounded-md border">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Search />
                                </EmptyMedia>
                                <EmptyTitle>No diagnoses yet</EmptyTitle>
                                <EmptyDescription>
                                    Once you submit a fault, it&apos;ll show up here.
                                </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                                <Button>Start a diagnosis</Button>
                            </EmptyContent>
                        </Empty>
                    </Section>
                </Group>

                {/* ─── OVERLAY & FEEDBACK ──────────────────────────────── */}
                <Group title="Overlay &amp; feedback">
                    <Section title="Alert">
                        <Alert>
                            <Bell />
                            <AlertTitle>Heads up!</AlertTitle>
                            <AlertDescription>
                                We&apos;ve received your photos.
                            </AlertDescription>
                        </Alert>
                        <div className="mt-3">
                            <Alert variant="destructive">
                                <AlertTitle>Something went wrong</AlertTitle>
                                <AlertDescription>
                                    We couldn&apos;t reach the diagnosis service.
                                </AlertDescription>
                            </Alert>
                        </div>
                    </Section>

                    <Section title="Dialog · Alert dialog · Drawer · Sheet · Popover · Hover card · Tooltip · Dropdown · Context menu · Command · Toast">
                        <div className="flex flex-wrap gap-3">
                            {/* Dialog */}
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline">Dialog</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Edit diagnosis</DialogTitle>
                                        <DialogDescription>
                                            Update the details below.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-2">
                                        <Label htmlFor="d-name">Name</Label>
                                        <Input id="d-name" />
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="outline">Cancel</Button>
                                        </DialogClose>
                                        <Button>Save</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {/* Alert dialog */}
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline">Alert dialog</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete diagnosis?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            {/* Drawer */}
                            <Drawer>
                                <DrawerTrigger asChild>
                                    <Button variant="outline">Drawer</Button>
                                </DrawerTrigger>
                                <DrawerContent>
                                    <DrawerHeader>
                                        <DrawerTitle>Quick filters</DrawerTitle>
                                        <DrawerDescription>
                                            Narrow your contractor results.
                                        </DrawerDescription>
                                    </DrawerHeader>
                                    <div className="px-4 pb-4 text-sm text-muted-foreground">
                                        Drawer body content here.
                                    </div>
                                    <DrawerFooter>
                                        <Button>Apply</Button>
                                        <DrawerClose asChild>
                                            <Button variant="outline">Cancel</Button>
                                        </DrawerClose>
                                    </DrawerFooter>
                                </DrawerContent>
                            </Drawer>

                            {/* Sheet */}
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="outline">Sheet</Button>
                                </SheetTrigger>
                                <SheetContent>
                                    <SheetHeader>
                                        <SheetTitle>Filter contractors</SheetTitle>
                                        <SheetDescription>
                                            Narrow the match results.
                                        </SheetDescription>
                                    </SheetHeader>
                                    <div className="px-4 text-sm text-muted-foreground">
                                        Sheet body.
                                    </div>
                                    <SheetFooter>
                                        <Button>Apply</Button>
                                        <SheetClose asChild>
                                            <Button variant="outline">Cancel</Button>
                                        </SheetClose>
                                    </SheetFooter>
                                </SheetContent>
                            </Sheet>

                            {/* Popover */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">Popover</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 text-sm">
                                    MND-1042 was created 2 hours ago.
                                </PopoverContent>
                            </Popover>

                            {/* Hover card */}
                            <HoverCard>
                                <HoverCardTrigger asChild>
                                    <Button variant="link">@shadcn</Button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-64">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src="https://github.com/shadcn.png" />
                                            <AvatarFallback>SC</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium">shadcn</div>
                                            <div className="text-xs text-muted-foreground">
                                                Component author
                                            </div>
                                        </div>
                                    </div>
                                </HoverCardContent>
                            </HoverCard>

                            {/* Tooltip */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" aria-label="More">
                                        <MoreHorizontal />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>More actions</TooltipContent>
                            </Tooltip>

                            {/* Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">
                                        Dropdown <ChevronDown />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                        <Settings /> Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        <ChevronRight /> Share
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive">
                                        <Trash2 /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Toast */}
                            <Button
                                onClick={() =>
                                    toast.success("Diagnosis saved", {
                                        description: "MND-1042 is ready to review.",
                                    })
                                }
                            >
                                Trigger toast
                            </Button>
                        </div>

                        {/* Context menu (right-click) */}
                        <div className="mt-6">
                            <Caption>Right-click the box below for the context menu</Caption>
                            <ContextMenu>
                                <ContextMenuTrigger className="mt-2 flex h-24 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                                    Right-click here
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    <ContextMenuItem>
                                        <Heart /> Favourite
                                    </ContextMenuItem>
                                    <ContextMenuItem>
                                        <Share2 /> Share
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem variant="destructive">
                                        <Trash2 /> Delete
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        </div>

                        {/* Command */}
                        <div className="mt-6">
                            <Caption>Command palette (inline)</Caption>
                            <Command className="mt-2 rounded-md border">
                                <CommandInput placeholder="Type a command…" />
                                <CommandList>
                                    <CommandEmpty>No results.</CommandEmpty>
                                    <CommandGroup heading="Suggestions">
                                        <CommandItem>
                                            <CalendarIcon /> Calendar
                                        </CommandItem>
                                        <CommandItem>
                                            <Star /> Favourites
                                        </CommandItem>
                                        <CommandItem>
                                            <LifeBuoy /> Support
                                            <CommandShortcut>⌘?</CommandShortcut>
                                        </CommandItem>
                                    </CommandGroup>
                                    <CommandSeparator />
                                    <CommandGroup heading="Settings">
                                        <CommandItem>
                                            <User /> Profile
                                            <CommandShortcut>⌘P</CommandShortcut>
                                        </CommandItem>
                                        <CommandItem>
                                            <Mail /> Mail
                                        </CommandItem>
                                        <CommandItem>
                                            <CreditCard /> Billing
                                        </CommandItem>
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </div>
                    </Section>
                </Group>

                {/* ─── LAYOUT UTILITIES ────────────────────────────────── */}
                <Group title="Layout utilities">
                    <Section title="Separator">
                        <div className="text-sm">Above the line</div>
                        <Separator className="my-3" />
                        <div className="text-sm">Below the line</div>
                    </Section>

                    <Section title="Resizable">
                        <ResizablePanelGroup
                            direction="horizontal"
                            className="h-40 rounded-md border"
                        >
                            <ResizablePanel defaultSize={30} className="p-3 text-sm">
                                Sidebar
                            </ResizablePanel>
                            <ResizableHandle withHandle />
                            <ResizablePanel defaultSize={70} className="p-3 text-sm">
                                Main content. Drag the handle to resize.
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </Section>
                </Group>

                {/* ─── COMMUNITY (Dice UI) ─────────────────────────────── */}
                <Group title="Community — Dice UI">
                    <Section title="Rating">
                        <Rating defaultValue={4} className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <RatingItem key={i} value={i} aria-label={`${i} stars`}>
                                    <Star className="size-5 fill-current" />
                                </RatingItem>
                            ))}
                        </Rating>
                    </Section>

                    <Section title="Stepper">
                        <Stepper defaultValue={2} className="w-full">
                            <StepperList>
                                <StepperItem value={1}>
                                    <StepperTrigger>
                                        <StepperIndicator />
                                        <StepperTitle>Photos</StepperTitle>
                                    </StepperTrigger>
                                    <StepperSeparator />
                                </StepperItem>
                                <StepperItem value={2}>
                                    <StepperTrigger>
                                        <StepperIndicator />
                                        <StepperTitle>Details</StepperTitle>
                                    </StepperTrigger>
                                    <StepperSeparator />
                                </StepperItem>
                                <StepperItem value={3}>
                                    <StepperTrigger>
                                        <StepperIndicator />
                                        <StepperTitle>Review</StepperTitle>
                                    </StepperTrigger>
                                </StepperItem>
                            </StepperList>
                            <div className="mt-4 flex gap-2">
                                <StepperPrev asChild>
                                    <Button variant="outline">Back</Button>
                                </StepperPrev>
                                <StepperNext asChild>
                                    <Button>Next</Button>
                                </StepperNext>
                            </div>
                        </Stepper>
                    </Section>

                    <Section title="Avatar group (custom — built on stock Avatar)">
                        <div className="space-y-4">
                            <div>
                                <Caption>No cap — all avatars shown</Caption>
                                <AvatarGroup className="mt-2">
                                    {["SC", "MP", "JD", "TM"].map((i) => (
                                        <Avatar key={i}>
                                            <AvatarFallback>{i}</AvatarFallback>
                                        </Avatar>
                                    ))}
                                </AvatarGroup>
                            </div>
                            <div>
                                <Caption>max=3 — overflow tile shows +N</Caption>
                                <AvatarGroup max={3} className="mt-2">
                                    {["SC", "MP", "JD", "TM", "AB", "CD"].map((i) => (
                                        <Avatar key={i}>
                                            <AvatarFallback>{i}</AvatarFallback>
                                        </Avatar>
                                    ))}
                                </AvatarGroup>
                            </div>
                        </div>
                    </Section>
                </Group>

                <footer className="mt-16 border-t pt-6 text-xs text-muted-foreground">
                    Not shown inline: <code>sidebar</code> (requires a full-page{" "}
                    <code>SidebarProvider</code> wrap) and the{" "}
                    <code>form</code> component (react-hook-form wired). Both are
                    installed and ready.
                </footer>

                <Toaster richColors closeButton />
            </main>
        </TooltipProvider>
    );
}

/* ─── small showcase helpers ─────────────────────────────── */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <>
            <h2 className="mt-14 mb-6 text-xs font-semibold uppercase tracking-widest text-foreground">
                {title}
            </h2>
            {children}
        </>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-10">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {title}
            </h3>
            {children}
        </section>
    );
}

function Caption({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {children}
        </div>
    );
}

function TypeRow({
    caption,
    children,
}: {
    caption: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <Caption>{caption}</Caption>
            {children}
        </div>
    );
}

function Swatch({ name, cls }: { name: string; cls: string }) {
    return (
        <div className="space-y-1.5">
            <div className={`h-14 rounded-md ${cls}`} />
            <code className="text-xs text-foreground">{name}</code>
        </div>
    );
}

