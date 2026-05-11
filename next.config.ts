import type { NextConfig } from 'next';

const securityHeaders = [
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
];

const nextConfig: NextConfig = {
    outputFileTracingRoot: process.cwd(),
    transpilePackages: ['geist'],
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

export default nextConfig;
