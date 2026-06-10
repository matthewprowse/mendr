/** Format a number as South African Rand, e.g. "R 1,234.56". */
export function formatZar(amount: number): string {
    const n = Number.isFinite(amount) ? amount : 0;
    return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
