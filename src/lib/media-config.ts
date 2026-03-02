/**
 * Phase 2 — Media & attachments: allowed types, size limits, and validation.
 * Used by diagnosis (chat), report view, and Pro–Customer messaging.
 */

export const MEDIA_CONFIG = {
  /** Max file size for any upload (50MB per build spec). */
  maxFileSizeBytes: 50 * 1024 * 1024,
  /** Max video duration in seconds (2 min per build spec). */
  maxVideoDurationSeconds: 120,
  /** Allowed MIME types for diagnosis chat and report. */
  allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  allowedVideoMimes: ['video/mp4', 'video/webm'] as const,
  /** Allowed MIME for Pro–Customer message attachments (images + documents + video). */
  allowedMessageImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  allowedMessageDocumentMimes: ['application/pdf'] as const,
  allowedMessageVideoMimes: ['video/mp4', 'video/webm'] as const,
} as const;

export type AttachmentType = 'image' | 'video' | 'document';

/** MIME type is allowed for diagnosis (chat) uploads. */
export function isAllowedDiagnosisMime(mime: string): boolean {
  return (
    MEDIA_CONFIG.allowedImageMimes.includes(mime as any) ||
    MEDIA_CONFIG.allowedVideoMimes.includes(mime as any)
  );
}

/** MIME type is image for diagnosis. */
export function isDiagnosisImageMime(mime: string): boolean {
  return MEDIA_CONFIG.allowedImageMimes.includes(mime as any);
}

/** MIME type is video for diagnosis. */
export function isDiagnosisVideoMime(mime: string): boolean {
  return MEDIA_CONFIG.allowedVideoMimes.includes(mime as any);
}

/** Infer attachment type from MIME. */
export function getAttachmentType(mime: string): AttachmentType {
  if (MEDIA_CONFIG.allowedImageMimes.includes(mime as any) || mime.startsWith('image/')) return 'image';
  if (MEDIA_CONFIG.allowedVideoMimes.includes(mime as any) || mime.startsWith('video/')) return 'video';
  if (MEDIA_CONFIG.allowedMessageDocumentMimes.includes(mime as any) || mime === 'application/pdf') return 'document';
  return 'image';
}

/** Validate file for diagnosis chat: MIME and size. Returns error message or null. */
export function validateDiagnosisFile(file: File): string | null {
  if (file.size > MEDIA_CONFIG.maxFileSizeBytes) {
    return `File is too large. Maximum size is ${MEDIA_CONFIG.maxFileSizeBytes / (1024 * 1024)}MB.`;
  }
  if (!isAllowedDiagnosisMime(file.type)) {
    return `File type not allowed. Please use images (JPEG, PNG, WebP, GIF) or video (MP4, WebM).`;
  }
  return null;
}

/** Get human-readable max size label. */
export function getMaxSizeLabel(): string {
  return `${MEDIA_CONFIG.maxFileSizeBytes / (1024 * 1024)}MB`;
}

/** Get human-readable max video duration label. */
export function getMaxVideoDurationLabel(): string {
  return '2 min';
}
