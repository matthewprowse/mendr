import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { withSentryConfig } from '@sentry/nextjs';

// ─────────────────────────────────────────────────────────────────────────────
// Content Security Policy
//
// 'unsafe-inline' in script-src is required for Next.js 15 — the framework
// injects inline hydration scripts that cannot be nonce-attributed without a
// custom middleware nonce strategy. Hardening to a nonce-based policy is
// tracked as a future improvement once Next.js supports it more ergonomically.
//
// 'unsafe-eval' is required on the dev server only — React uses eval() for dev
// debugging (e.g. flight/streaming). Use Next's `phase === PHASE_DEVELOPMENT_SERVER`
// (not NODE_ENV): this file is often evaluated with NODE_ENV=production while the
// config is transpiled, which would wrongly omit 'unsafe-eval' during `next dev`.
//
// All external fetch origins are covered by connect-src. The Supabase project
// URL is *.supabase.co (wildcard) because it is injected at runtime via env
// vars and may differ between environments.
// ─────────────────────────────────────────────────────────────────────────────

function buildSecurityHeaders(isDevelopmentServer: boolean) {
    const scriptSrcDirectives = [
        "'self'",
        "'unsafe-inline'",
        ...(isDevelopmentServer ? (["'unsafe-eval'"] as const) : []),
        'https://maps.googleapis.com',
    ];

    const ContentSecurityPolicy = [
        "default-src 'self'",

        // Scripts: self + Next.js inline hydration + Google Maps JS SDK
        // Note: 'unsafe-inline' cannot be removed until nonce middleware is in place
        `script-src ${scriptSrcDirectives.join(' ')}`,

        // Styles: self + Next.js inline styles (Tailwind) + Google Fonts
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

        // Images: self + data URIs (HEIC canvas) + blob (camera/file preview)
        //         + Supabase Storage + Google Maps tiles + Google place photos
        [
            "img-src 'self' data: blob:",
            'https://*.supabase.co',
            'https://*.googleapis.com',
            'https://*.gstatic.com',
            'https://lh3.googleusercontent.com',
            'https://streetviewpixels-pa.googleapis.com',
        ].join(' '),

        // Fonts: self + Google Fonts static files
        "font-src 'self' https://fonts.gstatic.com",

        // Fetch/XHR/WebSocket: self + Supabase (REST + Realtime) + Google APIs
        //                       + Brave Search + Upstash + Sentry ingestion
        [
            "connect-src 'self'",
            'https://*.supabase.co',
            'wss://*.supabase.co',
            'https://*.googleapis.com',
            'https://places.googleapis.com',
            'https://maps.googleapis.com',
            'https://api.search.brave.com',
            'https://*.upstash.io',
            'https://*.ingest.sentry.io',
        ].join(' '),

        // Media: self + blob (voice note recordings)
        "media-src 'self' blob:",

        // Workers: blob (Next.js service worker)
        "worker-src 'self' blob:",

        // No frames allowed — consistent with X-Frame-Options: DENY
        "frame-src 'none'",

        // Block plugins (Flash, etc.)
        "object-src 'none'",

        // Prevent base-tag hijacking
        "base-uri 'self'",

        // Lock form submissions to same origin
        "form-action 'self'",
    ].join('; ');

    return [
        // Prevent MIME-type sniffing — honour the declared Content-Type only.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Block the page from being embedded in any frame — prevents clickjacking.
        { key: 'X-Frame-Options', value: 'DENY' },
        // Only send the origin (no path/query) as the Referer to third-party domains.
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Restrict browser feature access — only camera/mic where needed.
        {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(self)',
        },
        // Content Security Policy — covers all external origins the app calls.
        // See the comment block above for notes on 'unsafe-inline' and hardening path.
        {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
        },
    ];
}

function createNextConfig(phase: string): NextConfig {
    const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER;
    const securityHeaders = buildSecurityHeaders(isDevelopmentServer);

    return {
        // Allow the preview tool to use a separate build directory so it never
        // shares the Turbopack persistent cache with the main dev server.
        distDir: process.env.NEXT_DIST_DIR ?? '.next',
        outputFileTracingRoot: process.cwd(),
        transpilePackages: ['geist'],
        // Sentry instrumentation + Turbopack: OpenTelemetry packages must be
        // imported directly from node_modules rather than bundled — Turbopack
        // fails to chunk their ESM builds at the instrumentation layer.
        serverExternalPackages: [
            '@opentelemetry/semantic-conventions',
            '@opentelemetry/api',
            '@opentelemetry/core',
            '@opentelemetry/resources',
            '@opentelemetry/sdk-trace-base',
        ],
        allowedDevOrigins: ['192.168.101.239'],
        webpack: (config, { dev }) => {
            // Heavy routes (e.g. match + Maps) can exceed the default chunk load timeout in dev
            // when compilation finishes after the browser request — avoids spurious ChunkLoadError.
            // Mutate `output` in place — replacing the object can break Next's CSS/font webpack setup.
            if (dev && config.output) {
                config.output.chunkLoadTimeout = 120_000;
            }
            return config;
        },
        // Next 16: Turbopack is the default dev bundler; an explicit `turbopack` key is required when a
        // `webpack` function is present (our hook only affects webpack builds / `next dev --webpack`).
        turbopack: {},
        experimental: {
            // Only bundle the icons/components you actually use (big win for geist-icons + radix-ui)
            optimizePackageImports: ['geist-icons'],
        },
        async redirects() {
            return [
                // /welcome → /start (301 permanent)
                { source: '/welcome', destination: '/start', permanent: true },
                // /pro/* → /contractors/* (301 permanent)
                { source: '/pro',                    destination: '/contractors',                    permanent: true },
                { source: '/pro/join',               destination: '/contractors',                    permanent: true },
                { source: '/pro/onboard',            destination: '/contractors/network',            permanent: true },
                { source: '/pro/application/edit',   destination: '/contractors/application/edit',   permanent: true },
                { source: '/pro/:id',                destination: '/contractors/:id',                permanent: true },
                // /api/pro/* → /api/contractors/*
                { source: '/api/pro/application/edit', destination: '/api/contractors/application/edit', permanent: true },
            ];
        },
        async headers() {
            return [
                {
                    // Apply to all routes.
                    source: '/(.*)',
                    headers: securityHeaders,
                },
            ];
        },
    };
}

// Wrap with Sentry only when the DSN is configured — no-ops in development
// until you set NEXT_PUBLIC_SENTRY_DSN.
const sentryConfig = {
    org: 'scandio',
    project: 'scandio-web',
    // Set SENTRY_AUTH_TOKEN in CI for source map uploads (see Sentry → Settings → Auth Tokens)
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    hideSourceMaps: true,
    disableLogger: true,
};

export default function defineNextConfig(phase: string): NextConfig {
    const nextConfig = createNextConfig(phase);
    return process.env.NEXT_PUBLIC_SENTRY_DSN
        ? withSentryConfig(nextConfig, sentryConfig)
        : nextConfig;
}
