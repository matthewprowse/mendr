import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Familjen_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/context/auth-context';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

const familjenGrotesk = Familjen_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '700'],
    variable: '--font-familjen-grotesk',
});

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: 'Scandio: Home Maintenance Assistant',
        template: '%s | Scandio',
    },
    description:
        'AI-powered home maintenance diagnosis and local provider discovery. Upload a photo, get expert insights and find trusted service professionals.',
    openGraph: {
        type: 'website',
        locale: 'en_ZA',
        siteName: 'Scandio',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            data-scroll-behavior="smooth"
            className={`${GeistSans.variable} ${GeistMono.variable} ${familjenGrotesk.variable}`}
        >
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
