'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type Props = {
    providerId: string | null;
    pending: boolean;
    providerName: string | null;
};

type AccountLink = { href: string; title: string; description: string };

function Heading({ subtitle }: { subtitle: string }) {
    return (
        <div className="flex w-full flex-col gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Account</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
    );
}

export default function AccountClient({ providerId, pending, providerName }: Props) {
    const router = useRouter();

    if (!providerId) {
        if (pending) {
            return (
                <Heading subtitle="Your claim is under review. We will let you know once your business is verified." />
            );
        }
        return (
            <>
                <Heading subtitle="Your business is not linked to a profile yet. Claim it to manage your profile, photos, and leads." />
                <Button asChild className="w-fit">
                    <Link href="/pro/claim">Claim Your Business</Link>
                </Button>
            </>
        );
    }

    const links: AccountLink[] = [
        {
            href: '/pro/account/edit',
            title: 'Edit Profile',
            description: 'Update your business details and description',
        },
        {
            href: '/pro/account/photos',
            title: 'Manage Photos',
            description: 'Add or remove the photos shown on your profile',
        },
        {
            href: '/pro/account/service-area',
            title: 'Service Area',
            description: 'Set the areas where you take work',
        },
        {
            href: '/pro/account/reviews',
            title: 'Reviews',
            description: 'See and reply to homeowner reviews',
        },
        {
            href: `/pro/${providerId}`,
            title: 'View Public Profile',
            description: 'See your profile as homeowners do',
        },
    ];

    return (
        <>
            <Heading
                subtitle={
                    providerName
                        ? `Manage the profile for ${providerName}.`
                        : 'Manage your Mendr Pro profile.'
                }
            />
            <div className="flex flex-col">
                {links.map((link, index) => (
                    <Fragment key={link.href}>
                        {index > 0 && <Separator />}
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(link.href)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    router.push(link.href);
                                }
                            }}
                            className="flex cursor-pointer items-center gap-3 py-3"
                        >
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="size-12 shrink-0"
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <p className="text-sm font-medium">{link.title}</p>
                                <p className="line-clamp-1 text-xs text-muted-foreground">
                                    {link.description}
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </div>
                    </Fragment>
                ))}
            </div>
        </>
    );
}
