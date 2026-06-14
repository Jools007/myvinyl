/**
 * Frozen playback baseline — update docs/PLAYBACK_BASELINE.md and docs/PLAYBACK_DEBUG.md when changing rules.
 *
 * Last verified good: adfecc2 (2026-06-14, before Play URL routing 9d1e21c).
 */
export const PLAYBACK_BASELINE = {
  knownGoodCommit: 'adfecc2',
  regressionCommit: '9d1e21c',
  architecture: {
    /** useTrackPreview() lives only in PlayNextPanel */
    previewHookOwner: 'PlayNextPanel',
    /** Single load effect keyed on nowKey — App must not call preview.load() */
    loadEffectKey: 'nowKey',
    /** browse ▶ passes autoplay true, enableSound true (user gesture) */
    soundOnAutoplay: true,
  },
  youtube: {
    /** Localhost desktop: plain embed + src reload (adfecc2); prod uses YT.Player + iframe fallback. */
    localhostMode: 'simple-iframe',
    iosMode: 'enablejsapi-embed',
    productionMode: 'iframe-api',
    desktopHostMount: 'play-yt-root' as const,
  },
  css: {
    /**
     * .play-dj__yt-root must have a real render surface (320×180, overflow:visible).
     * 0×0 overflow:hidden on the root clips embed audio after ~2 seconds.
     * Never use left:-9999px on the host.
     */
    ytRootRequired: { width: '320px', height: '180px', overflow: 'visible' },
    desktopHostForbidden: ['left: -9999px', 'left:-9999px'],
  },
} as const;

export type PlaybackBaseline = typeof PLAYBACK_BASELINE;