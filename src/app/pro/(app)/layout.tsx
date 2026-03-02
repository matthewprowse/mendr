'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarInset,
} from '@/components/ui/sidebar';
import { Layout, FileText, Wrench, GridSquare, Dollar, Key, Users } from 'geist-icons';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const navItems = [
    { href: '/pro/dashboard', label: 'Dashboard', icon: Layout },
    { href: '/pro/leads', label: 'Leads', icon: FileText },
    { href: '/pro/jobs', label: 'Jobs', icon: Wrench },
    { href: '/pro/products', label: 'Products', icon: GridSquare },
    { href: '/pro/finance', label: 'Finance', icon: Dollar },
    { href: '/pro/customers', label: 'Customers', icon: Users },
    { href: '/pro/settings', label: 'Settings', icon: Key },
];

export default function ProAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isMobile = useIsMobile();

    return (
        <SidebarProvider>
            {!isMobile && (
                <Sidebar>
                    <SidebarHeader className="border-b border-sidebar-border">
                        <Link href="/pro/dashboard" className="flex items-center gap-2 px-2 py-3">
                            <span className="font-semibold text-sidebar-foreground">Scandio Pro</span>
                        </Link>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {navItems.map(({ href, label, icon: Icon }) => (
                                        <SidebarMenuItem key={href}>
                                            <SidebarMenuButton
                                                asChild
                                                isActive={pathname === href || (href !== '/pro/dashboard' && pathname.startsWith(href))}
                                            >
                                                <Link href={href}>
                                                    <Icon className="size-4 shrink-0" />
                                                    <span>{label}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>
                </Sidebar>
            )}
            <SidebarInset className={cn(isMobile && 'pb-20')}>
                {children}
                {isMobile && (
                    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
                        {navItems.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                                    pathname === href || (href !== '/pro/dashboard' && pathname.startsWith(href))
                                        ? 'text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Icon className="size-5" />
                                <span>{label}</span>
                            </Link>
                        ))}
                    </nav>
                )}
            </SidebarInset>
        </SidebarProvider>
    );
}
