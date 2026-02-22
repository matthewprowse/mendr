'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Image } from 'lucide-react';

interface AppHeaderProps {
    title?: string;
    isLoading?: boolean;
    imageSrc?: string | null;
}

export function AppHeader({ title = 'Chat Name', isLoading = false, imageSrc }: AppHeaderProps) {
    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto px-4 md:px-12 py-4 flex items-center justify-between h-16">
                <div className="flex items-center min-w-0 flex-1">
                    {isLoading ? (
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-24 rounded-md" />
                            <Skeleton className="h-6 w-48 rounded-md" />
                        </div>
                    ) : (
                        <div className="space-y-1 min-w-0 overflow-hidden">
                            <h4 className="text-md font-semibold truncate leading-none">
                                Scandio
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">South Africa's Favourite Home Maintenance Assistant</p>
                        </div>
                    )}
                </div>
                {imageSrc && (
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
