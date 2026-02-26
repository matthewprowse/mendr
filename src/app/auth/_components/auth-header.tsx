import Image from 'next/image';
import Link from 'next/link';

export function AuthHeader() {
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
                <Link
                    href="/"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    Back
                </Link>
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/logo.svg"
                        alt="Scandio"
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 rounded-lg"
                    />
                    <span className="font-semibold">Scandio</span>
                </Link>
            </div>
        </header>
    );
}
