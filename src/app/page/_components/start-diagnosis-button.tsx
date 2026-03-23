'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';

type StartDiagnosisButtonProps = {
    children: React.ReactNode;
    className?: string;
    size?: 'default' | 'sm' | 'lg' | 'icon';
};

export function StartDiagnosisButton({ children, className, size }: StartDiagnosisButtonProps) {
    const router = useRouter();
    const handleClick = useCallback(() => {
        router.push('/welcome');
    }, [router]);

    return (
        <Button type="button" onClick={handleClick} className={className} size={size}>
            {children}
        </Button>
    );
}
