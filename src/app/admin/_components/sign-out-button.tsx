'use client';

export function SignOutButton() {
    return (
        <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={async () => {
                await fetch('/api/admin/login', { method: 'DELETE' });
                window.location.href = '/admin/login';
            }}
        >
            Sign out
        </button>
    );
}
