import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/context/auth-context';
import { getSiteUrl } from '@/lib/site-url';
import { BRAND_NAME } from '@/lib/brand-system';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: `${BRAND_NAME}: Home Maintenance Assistant`,
        template: `${BRAND_NAME}: %s`,
    },
    description:
        'AI-powered home maintenance diagnosis and local provider discovery. Upload a photo, get expert insights and find trusted service professionals.',
    openGraph: {
        type: 'website',
        locale: 'en_ZA',
        siteName: BRAND_NAME,
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    // Locked to 1 to suppress iOS Safari's auto-zoom on inputs with
    // font-size < 16px, so we can use text-sm in inputs/textareas across
    // mobile too. Trade-off: users cannot pinch-zoom the page.
    maximumScale: 1,
    userScalable: false,
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" data-scroll-behavior="smooth">
            <body className="font-sans antialiased">
                <AuthProvider>
                    <TooltipProvider>
                        <div className="flex flex-col min-h-screen bg-background">{children}</div>
                        <Toaster />
                    </TooltipProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
