import { useEffect, useState } from 'react';

export function useStickyHeaderTitle(params: {
    headerBarRef: React.RefObject<HTMLDivElement | null>;
    providerTitleRef: React.RefObject<HTMLDivElement | null>;
    providerName: string | null;
}) {
    const { headerBarRef, providerTitleRef, providerName } = params;
    const [showProviderInHeader, setShowProviderInHeader] = useState(false);

    useEffect(() => {
        const headerEl = headerBarRef.current;
        const titleEl = providerTitleRef.current;
        if (!headerEl || !titleEl) return;

        let observer: IntersectionObserver | null = null;

        const connect = () => {
            if (observer) observer.disconnect();
            const h = headerEl.offsetHeight;
            observer = new IntersectionObserver(
                ([entry]) => {
                    setShowProviderInHeader(!entry.isIntersecting);
                },
                { root: null, rootMargin: `-${h}px 0px 0px 0px`, threshold: 0 }
            );
            observer.observe(titleEl);
        };

        connect();
        const ro = new ResizeObserver(() => connect());
        ro.observe(headerEl);

        return () => {
            ro.disconnect();
            observer?.disconnect();
        };
    }, [headerBarRef, providerName, providerTitleRef]);

    return { showProviderInHeader };
}
