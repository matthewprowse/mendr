import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

/** 1–5 in half steps; used in Share Experience (sliders feel faster than star taps). */
export function CategorySliderRow({
    rowKey,
    label,
    value,
    onChange,
}: {
    rowKey: string;
    label: string;
    value: number;
    onChange: (n: number) => void;
}) {
    const inputId = `cat-slider-${rowKey}`;
    const display = value % 1 === 0 ? String(value) : value.toFixed(1);
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between gap-3">
                <Label className="text-sm" htmlFor={inputId}>
                    {label}
                </Label>
                <span className="text-sm tabular-nums text-muted-foreground">{display}</span>
            </div>
            <Slider
                id={inputId}
                value={[value]}
                onValueChange={(v) => {
                    const n = v[0];
                    if (typeof n === 'number' && Number.isFinite(n)) onChange(n);
                }}
                min={1}
                max={5}
                step={0.5}
                className="w-full"
                aria-label={`${label}: ${display} out of 5`}
            />
        </div>
    );
}
