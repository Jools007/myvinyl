/** Playback quirks on phones/tablets — keep free of React for use in plain classes. */

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isMobilePlaybackDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIOSDevice() || /Android/i.test(navigator.userAgent);
}

/** iOS only — desktop (including localhost) uses the IFrame API for stable play/pause. */
export function shouldUseSimpleYouTubeEmbed(): boolean {
  return isIOSDevice();
}

export function canAutoplayFromLoad(immediate: { source: string; previewUrl?: string } | null): boolean {
  if (!isMobilePlaybackDevice()) return true;
  if (!immediate) return false;
  return immediate.source === 'spotify' && Boolean(immediate.previewUrl?.trim());
}