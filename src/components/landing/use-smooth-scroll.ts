'use client';

import { useRef, type RefObject } from 'react';

// Custom rAF smooth scroll for the snap-section landing pages — faster and
// tunable versus native behavior:'smooth'. Shared by /landing1 and /landing2.
// `scrollAnimRef` is returned so the caller can cancel the animation on unmount.
export function useSmoothScroll(containerRef: RefObject<HTMLDivElement | null>) {
  const scrollAnimRef = useRef<number | null>(null);

  function smoothScrollTo(top: number, duration = 240) {
    const el = containerRef.current;
    if (!el) return;
    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    const start = el.scrollTop;
    const dist = top - start;
    if (Math.abs(dist) < 1) return; // already there — don't re-trigger the snap
    const t0 = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3); // easeOutCubic
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      el.scrollTop = start + dist * ease(p);
      scrollAnimRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    scrollAnimRef.current = requestAnimationFrame(step);
  }

  function goTo(pos: number) {
    smoothScrollTo(pos * (containerRef.current?.clientHeight ?? 0));
  }

  // Advance one screen — used by the tail Continue buttons.
  function scrollNext() {
    const el = containerRef.current;
    if (el) smoothScrollTo(el.scrollTop + el.clientHeight);
  }

  return { smoothScrollTo, goTo, scrollNext, scrollAnimRef };
}
