import type React from 'react';
import { AppShell } from './_components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return <AppShell>{children}</AppShell>;
}

