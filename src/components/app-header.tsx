'use client';

import NextImage from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
    imageSrc?: string | null;
    showViewImage?: boolean;
    showBack?: boolean;
    showNewScan?: boolean;
    onNewScanClick?: () => void;
}

export function AppHeader({
    imageSrc,
    showViewImage = true,
    showBack = false,
    showNewScan = false,
    onNewScanClick,
}: AppHeaderProps) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
                <div className="flex items-center gap-1">
                    {showBack && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-ml-2 text-muted-foreground hover:text-foreground"
                            aria-label="Go back"
                            onClick={() => router.back()}
                        >
                            <ArrowLeft className="size-4" />
                        </Button>
                    )}
                    <Link href="/" className="flex items-center gap-2">
                        <NextImage
                            src="/logo.svg"
                            alt="Menda"
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 rounded-lg"
                        />
                        <span className="text-sm font-semibold tracking-tight">Menda</span>
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    {imageSrc && showViewImage && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full text-xs"
                            onClick={() => window.open(imageSrc, '_blank')}
                        >
                            View Image
                        </Button>
                    )}
                    {showNewScan && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full text-xs"
                            onClick={onNewScanClick}
                        >
                            New Scan
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
