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
        value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
    },
];

const nextConfig: NextConfig = {
    transpilePackages: ['geist'],
    allowedDevOrigins: ['192.168.101.239'],
    experimental: {
        // Only bundle the icons/components you actually use (big win for geist-icons + radix-ui)
        optimizePackageImports: ['geist-icons', 'radix-ui'],
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
