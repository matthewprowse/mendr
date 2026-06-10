'use client';

// global-error.tsx catches errors in the root layout itself.
// For route-level errors, Next.js uses the nearest error.tsx.
// This is the last-resort catch for anything that escapes all other boundaries.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100dvh',
                    padding: '2rem',
                    fontFamily: 'system-ui, sans-serif',
                    backgroundColor: '#fafafa',
                    color: '#111',
                    gap: '1rem',
                    textAlign: 'center',
                }}
            >
                <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                    Something went wrong
                </h1>
                <p style={{ fontSize: '0.9rem', color: '#555', margin: 0, maxWidth: 360 }}>
                    We've been notified and will look into it. Try refreshing the page — if
                    the problem persists, contact us at{' '}
                    <a href="mailto:support@mendr.co.za" style={{ color: '#111' }}>
                        support@mendr.co.za
                    </a>
                    .
                </p>
                {error.digest && (
                    <p style={{ fontSize: '0.75rem', color: '#999', margin: 0 }}>
                        Error ID: {error.digest}
                    </p>
                )}
                <button
                    onClick={reset}
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1.25rem',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        background: '#111',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                    }}
                >
                    Try again
                </button>
            </body>
        </html>
    );
}
