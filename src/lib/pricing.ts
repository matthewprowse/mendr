export const CALLOUT_RATE_PER_KM = 12;
export const MIN_CALLOUT_FEE = 350;

/**
 * Converts route distance (meters) to a rounded Rand call-out estimate.
 */
export function calculateCalloutFee(distanceMeters: number): string {
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
        return `R${MIN_CALLOUT_FEE}`;
    }

    const distanceKm = distanceMeters / 1000;
    const variableFee = distanceKm * CALLOUT_RATE_PER_KM;
    const total = Math.max(MIN_CALLOUT_FEE, Math.round(variableFee));
    return `R${total.toLocaleString('en-ZA')}`;
}
