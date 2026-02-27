import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import NextImage from 'next/image';
import { AppHeader } from '@/components/app-header';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/auth/sign-in?redirect=/dashboard/history');
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-50 border-b border-border bg-background">
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
                    <nav className="flex items-center gap-4">
                        <Link
                            href="/dashboard/history"
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            History
                        </Link>
                        <Link
                            href="/"
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            New scan
                        </Link>
                    </nav>
                </div>
            </header>
            <main className="flex-1">{children}</main>
        </div>
    );
}
