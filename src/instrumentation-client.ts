// Sentry client-side initialisation (browser).
//
// Next 16+ loads this file from `src/instrumentation-client.ts` automatically
// for the browser bundle. Replaces the older `sentry.client.config.ts`
// location, which `@sentry/nextjs` 10.x deprecated.
//
// TO ACTIVATE:
//   1. npm install @sentry/nextjs (already in deps)
//   2. Set NEXT_PUBLIC_SENTRY_DSN in your .env.local and Vercel env vars
//   3. Wrap next.config.ts with withSentryConfig (see next.config.ts)

import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Disable in development to keep the console clean
    enabled: process.env.NODE_ENV === 'production',

    // Capture 10% of sessions for performance monitoring (adjust for beta)
    tracesSampleRate: 0.1,

    // Replay 5% of sessions, 100% of sessions with an error
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
        Sentry.replayIntegration({
            // Mask all text and block all media by default — important for homeowner data
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],
});
