/**
 * Frozen playback baseline — update docs/PLAYBACK_BASELINE.md when changing any rule here.
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
    /** browse ▶ passes autoplay true, enableSound false */
    soundOnAutoplay: false,
  },
  youtube: {
    /** Desktop + localhost: IFrame API. iOS only: enablejsapi embed + postMessage */
    localhostMode: 'iframe-api',
    iosMode: 'enablejsapi-embed',
    desktopHostPosition: 'right-bottom-clip' as const,
  },
  css: {
    /**
     * Desktop .play-dj__yt-host must stay in viewport (right:0 bottom:0 + clip).
     * left:-9999px causes Chrome to pause embed audio after ~2 seconds.
     */
    desktopHostForbidden: ['left: -9999px', 'left:-9999px'],
  },
} as const;

export type PlaybackBaseline = typeof PLAYBACK_BASELINE;