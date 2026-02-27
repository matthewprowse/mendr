/**
 * Phase 2 — Storage path patterns for Supabase Storage buckets.
 * Buckets: avatars, banners, vault, showcase, reviews.
 * Use these paths with supabase.storage.from(bucket).upload(path, file) or .getPublicUrl(path).
 */

export const STORAGE_BUCKETS = {
  avatars: 'avatars',
  banners: 'banners',
  vault: 'vault',
  showcase: 'showcase',
  reviews: 'reviews',
} as const;

export type StorageBucket = keyof typeof STORAGE_BUCKETS;

/** User profile photo: {user_id}/profile.jpg */
export function avatarPath(userId: string): string {
  return `${userId}/profile.jpg`;
}

/** Provider banner: {provider_id}/banner.jpg */
export function bannerPath(providerId: string): string {
  return `${providerId}/banner.jpg`;
}

/** Raw history (Property Vault): {user_id}/{property_id}/{timestamp}_raw.jpg */
export function vaultPath(
  userId: string,
  propertyId: string,
  timestamp: string | number
): string {
  return `${userId}/${propertyId}/${timestamp}_raw.jpg`;
}

/** Provider portfolio: {provider_id}/{category}/{uuid}.jpg */
export function showcasePath(
  providerId: string,
  category: string,
  uuid: string
): string {
  return `${providerId}/${category}/${uuid}.jpg`;
}

/** Evidence-based review photo: {job_id}/{uuid}.jpg */
export function reviewPath(jobId: string, uuid: string): string {
  return `${jobId}/${uuid}.jpg`;
}
