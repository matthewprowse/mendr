'use client';

import NextImage from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
    title?: string;
    isLoading?: boolean;
    imageSrc?: string | null;
    scrolled?: boolean;
    showViewImage?: boolean;
}

export function AppHeader({ title = 'Chat Name', isLoading = false, imageSrc, scrolled, showViewImage = true }: AppHeaderProps) {
    return (
        <header className={`sticky top-0 z-50 bg-background transition-shadow duration-200 ${scrolled ? 'shadow-sm' : ''}`}>
            <div className="mx-auto px-4 md:px-12 py-4 flex items-center justify-between h-16">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <NextImage
                        src="/logo.svg"
                        alt="Scandio"
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-lg"
                    />
                    {isLoading ? (
                        <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-4 w-24 rounded-md" />
                            <Skeleton className="h-3 w-48 rounded-md" />
                        </div>
                    ) : (
                        <div className="space-y-1 min-w-0 overflow-hidden">
                            <h4 className="text-md font-semibold truncate leading-none">
                                Scandio
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">SA's Favourite Home Maintenance Assistant</p>
                        </div>
                    )}
                </div>
                {imageSrc && showViewImage && (
                    <Button
                        variant="secondary"
                        onClick={() => window.open(imageSrc, '_blank')}
                    >
                        View Image
                    </Button>
                )}
            </div>
        </header>
    );
}
