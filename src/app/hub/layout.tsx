import { CustomerHubFooter } from '@/components/customer-hub-footer';
import { CustomerHubHeader } from '@/components/customer-hub-header';
import { HubAuthGuard } from './_components/hub-auth-guard';

export default function HubLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <CustomerHubHeader />
            <main className="flex-1 pb-20 md:pb-0">
                <HubAuthGuard>{children}</HubAuthGuard>
            </main>
            <CustomerHubFooter />
        </div>
    );
}
