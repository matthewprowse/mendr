// Next.js instrumentation hook — runs once on server startup.
// Used to initialise Sentry for both Node.js (server) and Edge runtimes.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { init } = await import('@sentry/nextjs');
        init({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            enabled: process.env.NODE_ENV === 'production',
            tracesSampleRate: 0.1,
            // Attach userId to all server-side events
            beforeSend(event) {
                return event;
            },
        });
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        const { init } = await import('@sentry/nextjs');
        init({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            enabled: process.env.NODE_ENV === 'production',
            tracesSampleRate: 0.1,
        });
    }
}

// Capture unhandled promise rejections from React Server Components
export const onRequestError = async (
    err: unknown,
    request: { path: string; method: string },
    context: { routerKind: string; routePath: string },
) => {
    const { captureRequestError } = await import('@sentry/nextjs');
    captureRequestError(err, request, context);
};
