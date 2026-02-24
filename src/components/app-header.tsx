'use client';

import NextImage from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
    imageSrc?: string | null;
    showViewImage?: boolean;
}

export function AppHeader({ imageSrc, showViewImage = true }: AppHeaderProps) {
    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
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
                {imageSrc && showViewImage && (
                    <Button variant="secondary" onClick={() => window.open(imageSrc, '_blank')}>
                        View Image
                    </Button>
                )}
            </div>
        </header>
    );
}
