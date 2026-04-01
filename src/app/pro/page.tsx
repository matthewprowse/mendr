/**
 * Route: /welcome
 * First step in the scan flow. User uploads an image/video, then we continue to /diagnosis/[id].
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trade = searchParams.get('trade') || '';

    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;

            setIsUploading(true);
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
                const conversationId = crypto.randomUUID();
                setImageData(conversationId, finalDataUrl, file.name);

                const qp = new URLSearchParams();
                if (trade) qp.set('trade', trade);
                const suffix = qp.toString() ? `?${qp.toString()}` : '';

                router.push(`/diagnosis/${conversationId}${suffix}`);
            } finally {
                setIsUploading(false);
            }
        },
        [router, trade]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
        e.target.value = '';
    };

    const ratingCards = [
        { label: 'Punctuality', value: '4.8' },
        { label: 'Cleanliness', value: '4.6' },
        { label: 'Work Quality', value: '4.7' },
        { label: 'Quote Accuracy', value: '4.8' },
    ];

    const ratingCardClassName = 'flex flex-col px-4 p-3 border border-input/75 rounded-lg';
    const ratingLabelClassName = 'text-sm text-muted-foreground font-medium';
    const ratingValueClassName = 'text-lg text-foreground font-bold';

    const scandioReviewCards = [
        {
            fullName: 'Alex Robertson',
            initials: 'AR',
            rating: '4.9',
            sentAt: '15 Mar 2026',
            body: 'They were friendly, punctual, and respectful of my home. The work was done carefully from start to finish, and the final finish looks great. I also appreciated the quick clean-up when they were finished.',
        },
        {
            fullName: 'Sam Thompson',
            initials: 'ST',
            rating: '4.7',
            sentAt: '10 Mar 2026',
            body: 'Great communication throughout the job and clear updates on what to expect. The quality of the work was solid, and they kept the workspace tidy as they went. Overall, it felt professional and well-organized.',
        },
        {
            fullName: 'Priya Kumar',
            initials: 'PK',
            rating: '4.8',
            sentAt: '03 Mar 2026',
            body: 'Clean, professional, and very thorough. The team took time to explain the plan, followed through on every step, and left the space spotless afterwards. The quote matched what we agreed and there were no surprises.',
        },
    ];

    const googleReviewCards = [
        {
            fullName: 'Emma Williams',
            initials: 'EW',
            rating: '4.8',
            sentAt: '25 Feb 2026',
            body: 'The job was completed to a high standard. They arrived on time, protected the surrounding areas, and worked efficiently without sacrificing quality. Everything was explained clearly before work began, and the final result looks excellent.',
        },
        {
            fullName: 'Daniel Carter',
            initials: 'DC',
            rating: '4.6',
            sentAt: '18 Feb 2026',
            body: 'Communication was great and they kept me updated throughout. The team was tidy, professional, and did a thorough clean-up afterward. Minor details were handled promptly, and I felt confident with the process from start to finish.',
        },
        {
            fullName: 'Sophia Morgan',
            initials: 'SM',
            rating: '4.7',
            sentAt: '09 Feb 2026',
            body: 'Very respectful and hardworking. The work was done carefully, with attention to the small finishing touches that make a difference. The quote was accurate and there were no unexpected changes. I would happily use them again.',
        },
    ];

    const reviewCardClassName = 'min-h-36 border border-border/75 rounded-lg p-4 flex flex-col gap-2';
    const reviewHeaderClassName = 'flex items-start justify-between gap-2';
    const reviewMetaRowClassName = 'flex items-center gap-2';
    const reviewAvatarClassName =
        'h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-medium text-muted-foreground';
    const reviewAuthorClassName = 'text-sm font-medium text-foreground';
    const reviewSentAtClassName = 'text-[11px] text-muted-foreground';
    const reviewOverallClassName = 'text-sm font-bold text-foreground';
    const reviewBodyClassName = 'text-sm text-muted-foreground leading-relaxed';

    return (
        <main className="flex flex-col gap-6 p-4 pt-22 pb-22">
            <div className="flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50">
                <Button variant="secondary" size="icon" className="h-10 w-10" onClick={() => router.back()}>
                    <ArrowLeft className="size-5" />
                </Button>
                <h3 className="text-lg text-foreground font-semibold">Scandio</h3>
                <Button variant="ghost" size="icon" className="hover:bg-transparent" />
            </div>

            <div className="flex h-48 bg-secondary rounded-lg" />
            <div className="flex flex-col gap-2">
                <div className="flex flex-row justify-between items-center">
                    <h1 className="text-2xl text-foreground font-bold">Company Name</h1>
                    <Badge variant="secondary">Open</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                </p>
            </div>

            <Tabs defaultValue="about">
                <TabsList className="grid grid-cols-3 h-10">
                    <TabsTrigger
                        value="about"
                        className="h-8"
                    >
                        About
                    </TabsTrigger>
                    <TabsTrigger
                        value="reviews"
                        className="h-8"
                    >
                        Reviews
                    </TabsTrigger>
                    <TabsTrigger
                        value="gallery"
                        className="h-8"
                    >
                        Gallery
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="about" className="flex flex-col gap-6 mt-6">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-lg text-foreground font-bold">Summary</h3>
                        <p className="text-sm text-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="text-lg text-foreground font-bold">Operating Hours</h3>
                        <div className="flex flex-row justify-between items-center">
                            <p className="text-sm text-foreground font-medium">Monday</p>
                            <p className="text-sm text-muted-foreground">10:00 - 17:00</p>
                        </div>
                        <div className="flex flex-row justify-between items-center">
                            <p className="text-sm text-foreground font-medium">Tuesday</p>
                            <p className="text-sm text-muted-foreground">10:00 - 17:00</p>
                        </div>
                        <Button variant="secondary" className="h-10">View More</Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="text-lg text-foreground font-bold">Directions</h3>
                        <div className="flex flex-col text-center px-4 py-24 bg-secondary rounded-lg">
                            <p className="text-xs text-muted-foreground">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                    </div>
                </TabsContent>

                <TabsContent value="reviews" className="flex flex-col gap-6 mt-6">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-lg text-foreground font-bold">Reviews</h3>
                        <p className="text-sm text-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {ratingCards.map((card) => (
                            <div
                                key={card.label}
                                className={ratingCardClassName}
                            >
                                <p className={ratingLabelClassName}>{card.label}</p>
                                <p className={ratingValueClassName}>{card.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-4">
                        <h6 className="text-md text-foreground font-bold">Scandio Reviews</h6>
                        <Button
                            variant="secondary"
                            className="h-10"
                        >
                            Share Experience
                        </Button>

                        {scandioReviewCards.map((r) => (
                            <div
                                key={r.fullName}
                                className={reviewCardClassName}
                            >
                                <div className={reviewHeaderClassName}>
                                    <div className={reviewMetaRowClassName}>
                                        <div className={reviewAvatarClassName}>
                                            {r.initials}
                                        </div>
                                        <div className="flex flex-col">
                                            <p className={reviewAuthorClassName}>{r.fullName}</p>
                                            <p className={reviewSentAtClassName}>{r.sentAt}</p>
                                        </div>
                                    </div>
                                    <p className={reviewOverallClassName}>{r.rating}</p>
                                </div>
                                <p className={reviewBodyClassName}>{r.body}</p>
                            </div>
                        ))}

                        <Button
                            variant="secondary"
                            className="h-10 w-full"
                        >
                            View More
                        </Button>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h6 className="text-md text-foreground font-bold">Google Reviews</h6>

                        {googleReviewCards.map((r) => (
                            <div
                                key={r.fullName}
                                className={reviewCardClassName}
                            >
                                <div className={reviewHeaderClassName}>
                                    <div className={reviewMetaRowClassName}>
                                        <div className={reviewAvatarClassName}>
                                            {r.initials}
                                        </div>
                                        <div className="flex flex-col">
                                            <p className={reviewAuthorClassName}>{r.fullName}</p>
                                            <p className={reviewSentAtClassName}>{r.sentAt}</p>
                                        </div>
                                    </div>
                                    <p className={reviewOverallClassName}>{r.rating}</p>
                                </div>
                                <p className={reviewBodyClassName}>{r.body}</p>
                            </div>
                        ))}

                        <Button
                            variant="secondary"
                            className="h-10 w-full"
                        >
                            View More
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="gallery" className="flex flex-col gap-6 mt-6">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-lg text-foreground font-bold">Gallery</h3>
                        <p className="text-sm text-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="aspect-square overflow-hidden rounded-xl bg-secondary"
                                />
                            ))}
                        </div>

                        <Button
                            variant="secondary"
                            className="h-10 w-full"
                        >
                            Add Photo
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>

            <div className="flex flex-row gap-2 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
                <Popover open={contactOpen} onOpenChange={setContactOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="secondary" className="flex flex-1 h-10">Contact</Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-64 p-3 rounded-md shadow-xl border-input"
                        align="start"
                        side="top"
                        sideOffset={4}
                    >
                        <div className="flex flex-col gap-3">
                            <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => setContactOpen(false)}
                            >
                                WhatsApp
                            </Button>
                            <p className="text-xs text-muted-foreground text-center">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                            </p>
                            <div className="flex flex-row gap-2">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-10"
                                    onClick={() => setContactOpen(false)}
                                >
                                    Phone
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-10"
                                    onClick={() => setContactOpen(false)}
                                >
                                    Email
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button variant="ghost" className="flex flex-1 h-10 text-muted-foreground">Website</Button>
            </div>
        </main>
    );
}

