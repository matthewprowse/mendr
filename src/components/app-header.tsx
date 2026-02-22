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
                        <Skeleton className="h-7 w-48 rounded-md" />
                    ) : (
                        <div className="space-y-1">
                            <h1 className="text-lg font-semibold truncate leading-none">
                                Scandio
                            </h1>
                            <p className="text-sm text-muted-foreground">South Africa's Favourite Home Maintenance Assistant</p>
                        </div>
                    )}
                </div>
                {imageSrc && (
                    <Button
                        variant="secondary"
                        onClick={() => window.open(imageSrc, '_blank')}
                    >
                        View Analysed Image
                    </Button>
                )}
            </div>
        </header>
    );
}
