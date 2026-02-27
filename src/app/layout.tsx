import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/context/auth-context';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: {
        default: 'Scandio: Home Maintenance Assistant',
        template: '%s | Scandio',
    },
    description:
        'AI-powered home maintenance diagnosis and local provider discovery. Upload a photo, get expert insights and find trusted service professionals.',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
                <TooltipProvider>
                    <AuthProvider>
                        <div className="flex flex-col min-h-screen bg-background">{children}</div>
                        <Toaster />
                    </AuthProvider>
                </TooltipProvider>
            </body>
        </html>
    );
}
