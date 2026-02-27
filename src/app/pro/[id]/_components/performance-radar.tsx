'use client';

type Metric = { label: string; value: number };

const MAX = 10;
const AXES = 4;

export function PerformanceRadar({ metrics }: { metrics: Metric[] }) {
    if (metrics.length === 0) return null;

    const size = 200;
    const center = size / 2;
    const radius = center - 24;

    const points = metrics.slice(0, AXES).map((m, i) => {
        const angle = (i * 360) / AXES - 90;
        const rad = (angle * Math.PI) / 180;
        const r = (m.value / MAX) * radius;
        return {
            x: center + r * Math.cos(rad),
            y: center + r * Math.sin(rad),
            label: m.label,
            value: m.value,
        };
    });

    const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ');
    const axisLines = points.map((p, i) => {
        const angle = (i * 360) / AXES - 90;
        const rad = (angle * Math.PI) / 180;
        const x2 = center + radius * Math.cos(rad);
        const y2 = center + radius * Math.sin(rad);
        return (
            <line
                key={i}
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeOpacity={0.2}
                strokeWidth={1}
            />
        );
    });

    const gridCircles = [0.25, 0.5, 0.75, 1].map((scale, i) => (
        <circle
            key={i}
            cx={center}
            cy={center}
            r={radius * scale}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
        />
    ));

    return (
        <div className="flex flex-col items-center">
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="h-52 w-52 text-foreground"
                aria-hidden
            >
                {gridCircles}
                {axisLines}
                <polygon
                    points={polygonPoints}
                    fill="currentColor"
                    fillOpacity={0.2}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                />
                {points.map((p, i) => (
                    <g key={i}>
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r={4}
                            fill="currentColor"
                            className="text-primary"
                        />
                        <text
                            x={p.x + (p.x >= center ? 6 : -6)}
                            y={p.y + (p.y >= center ? 14 : -6)}
                            textAnchor={p.x >= center ? 'start' : 'end'}
                            className="fill-muted-foreground text-[10px]"
                        >
                            {p.label} {p.value}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}
