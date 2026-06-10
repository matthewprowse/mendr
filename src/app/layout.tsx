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
    // Pinch-zoom is left enabled for accessibility (WCAG 1.4.4 / Lighthouse).
    // To avoid iOS Safari's auto-zoom on focus, keep input/textarea font-size
    // at >= 16px on mobile rather than disabling zoom.
    maximumScale: 5,
    userScalable: true,
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
