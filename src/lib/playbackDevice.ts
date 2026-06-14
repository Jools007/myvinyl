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

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** Localhost + iOS — avoid YT.Player (postMessage origin break on http://localhost). */
export function shouldUseSimpleYouTubeEmbed(): boolean {
  return isIOSDevice() || isLocalDevHost();
}

export function canAutoplayFromLoad(immediate: { source: string; previewUrl?: string } | null): boolean {
  if (!isMobilePlaybackDevice()) return true;
  if (!immediate) return false;
  return immediate.source === 'spotify' && Boolean(immediate.previewUrl?.trim());
}