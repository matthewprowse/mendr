import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    experimental: {
        // Only bundle the icons/components you actually use (big win for geist-icons + radix-ui)
        optimizePackageImports: ['geist-icons', 'radix-ui'],
    },
};

export default nextConfig;
