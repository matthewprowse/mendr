import type { ReactNode } from 'react';

export default function ContractorPortalLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <nav className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
                <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
                    <a
                        href="/contractors"
                        className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                    >
                        Mendr Contractors
                    </a>
                    <a
                        href="/contractors/account"
                        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                    >
                        My Account
                    </a>
                </div>
            </nav>
            {children}
        </>
    );
}
