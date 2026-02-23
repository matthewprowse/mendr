"use client";

import { useEffect, useRef, useState } from "react";

const MEASURE_FONT_SIZE = 100;

export function StripeBrandText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(MEASURE_FONT_SIZE);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const updateFontSize = () => {
      const containerWidth = container.offsetWidth;
      const measureWidth = measure.offsetWidth;
      if (measureWidth > 0 && containerWidth > 0) {
        const scale = (containerWidth / measureWidth) * 0.95;
        setFontSize(MEASURE_FONT_SIZE * scale);
      }
    };

    updateFontSize();

    const resizeObserver = new ResizeObserver(updateFontSize);
    resizeObserver.observe(container);

    document.fonts?.ready?.then(updateFontSize);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative block w-full overflow-visible">
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
        style={{
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          fontSize: `${MEASURE_FONT_SIZE}px`,
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        Scandio
      </span>
      <span
        className="text-striped-muted block whitespace-nowrap text-center font-bold leading-none tracking-tighter"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          letterSpacing: "-0.05em",
        }}
      >
        Scandio
      </span>
    </div>
  );
}
