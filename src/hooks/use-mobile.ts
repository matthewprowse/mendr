'use client';

import { useEffect, useState } from 'react';

/**
 * Shared "is mobile" detection for responsive UI.
 * Uses a matchMedia query so it updates when the viewport changes.
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');

        const update = () => setIsMobile(mq.matches);
        update();

        // Safari fallback for older browser versions.
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
            return () => mq.removeEventListener('change', update);
        }

        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);

    return isMobile;
}

