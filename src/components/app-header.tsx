'use client';

import NextImage from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { UserAvatarMenu } from '@/components/user-avatar-menu';

interface AppHeaderProps {
    imageSrc?: string | null;
    showViewImage?: boolean;
    showBack?: boolean;
}

export function AppHeader({ imageSrc, showViewImage = true, showBack = false }: AppHeaderProps) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
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
                            alt="Scandio"
                            width={36}
                            height={36}
                            className="h-9 w-9 shrink-0 rounded-lg"
                        />
                        <span className="font-semibold">Scandio</span>
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    {imageSrc && showViewImage && (
                        <Button variant="secondary" onClick={() => window.open(imageSrc, '_blank')}>
                            View Image
                        </Button>
                    )}

                    <Button variant="secondary" asChild>
                        <Link href="/pro">Join Pro Network</Link>
                    </Button>

                    <UserAvatarMenu />
                </div>
            </div>
        </header>
    );
}
