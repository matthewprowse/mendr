/**
 * Phase 2 — Get video duration for validation (max 2 min).
 */

/**
 * Returns duration in seconds, or null if not a video or failed to load.
 */
export function getVideoDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
