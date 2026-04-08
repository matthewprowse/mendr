import { ReactNode } from 'react';
import { AdminHeader } from './components/header';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AdminHeader />

            <main className="flex-1">{children}</main>
        </div>
    );
}
