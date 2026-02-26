/**
 * Pricing constants for Scandio reports.
 * Western Cape home services industry rates.
 */

/** Call-out fee per kilometre (ZAR). Based on typical Western Cape home service rates. */
export const CALLOUT_RATE_PER_KM = 18;

/**
 * Calculates the exact call-out fee based on driving distance.
 * @param distanceMeters - Distance from provider to customer in metres
 * @returns Exact fee in ZAR, formatted (e.g. "R277")
 */
export function calculateCalloutFee(distanceMeters: number): string {
    const km = distanceMeters / 1000;
    const amount = Math.round(km * CALLOUT_RATE_PER_KM);
    return `R${amount.toLocaleString('en-ZA')}`;
}
