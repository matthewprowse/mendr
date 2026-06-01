'use client';

import { Button } from '@/components/ui/button';

export function SignOutButton() {
    return (
        <Button
            type="button"
            variant="ghost"
            onClick={async () => {
                await fetch('/api/admin/login', { method: 'DELETE' });
                window.location.href = '/admin/login';
            }}
        >
            Log out
        </Button>
    );
}
