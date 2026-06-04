'use client';

import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/auth/supabase';

export function SignOutButton() {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
                try {
                    await getSupabase().auth.signOut();
                } catch {
                    // Ignore — always send the user home afterwards.
                }
                window.location.href = '/home';
            }}
        >
            Log Out
        </Button>
    );
}
