'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

type StartDiagnosisButtonProps = {
    children: React.ReactNode;
    className?: string;
    size?: 'default' | 'sm' | 'lg' | 'icon';
};

export function StartDiagnosisButton({ children, className, size }: StartDiagnosisButtonProps) {
    return (
        <Button asChild className={className} size={size}>
            <Link href="/start">{children}</Link>
        </Button>
    );
}
