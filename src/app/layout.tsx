import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

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
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Prevent flash of wrong theme on load */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var isDark=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',isDark)}catch(e){}})()`,
                    }}
                />
            </head>
            <body className="font-sans antialiased">
                <TooltipProvider>
                    <div className="flex flex-col min-h-screen bg-background">{children}</div>
                    <Toaster />
                </TooltipProvider>
            </body>
        </html>
    );
}
