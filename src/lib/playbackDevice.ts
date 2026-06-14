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

/** iOS + local dev: simple embed, started from our play button inside a user gesture. */
export function shouldUseSimpleYouTubeEmbed(): boolean {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  return isIOSDevice();
}

export function canAutoplayFromLoad(immediate: { source: string; previewUrl?: string } | null): boolean {
  if (!isMobilePlaybackDevice()) return true;
  if (!immediate) return false;
  return immediate.source === 'spotify' && Boolean(immediate.previewUrl?.trim());
}