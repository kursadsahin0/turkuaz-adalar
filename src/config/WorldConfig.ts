import { GAME_CONFIG } from './GameConfig.ts'

/**
 * Art-direction and performance tuning for the environment. Gameplay values
 * stay in `GameConfig`; these values only describe the world's visual shell.
 * Vertical values are offsets from `GAME_CONFIG.track.topY` unless noted.
 */
export const WORLD_CONFIG = {
  platform: {
    /** Playable checker surface, slightly inset from the white rim. */
    checkerWidth: GAME_CONFIG.track.width - 0.3,
    checkerLength: GAME_CONFIG.track.segmentLength - 0.12,
    checkerHeight: 0.24,
    checkerRepeatX: 4,
    checkerRepeatY: 13,
    /** White rim, a subtle step below the checker surface. */
    rimWidth: GAME_CONFIG.track.width + 0.26,
    rimLength: GAME_CONFIG.track.segmentLength,
    rimTopDrop: 0.05,
    rimHeight: 0.34,
    /** Turquoise band tucked under the white rim. */
    trimWidth: GAME_CONFIG.track.width + 0.34,
    trimTopDrop: 0.38,
    trimHeight: 0.14,
    /** Thin turquoise pinstripe running along the white border. */
    stripeWidth: 0.075,
    stripeHeight: 0.025,
    stripeOffsetX: GAME_CONFIG.track.width / 2 - 0.02,
    /** Baked yellow studs dotted along the rim. */
    studRadius: 0.055,
    studSpacing: 6,
    /** Rotating yellow gear on each grass bank. */
    mechanismRadius: 0.42,
    mechanismOffsetX: GAME_CONFIG.track.width / 2 + 0.72,
    mechanismSpacing: 10.5,
  },

  island: {
    bankWidth: GAME_CONFIG.track.width + 2.55,
    bankLength: GAME_CONFIG.track.segmentLength,
    grassWidth: 1.14,
    grassHeight: 0.36,
    grassTopDrop: 0.07,
    sandHeight: 0.55,
    sandTopDrop: 0.2,
    rockHeight: 2.8,
    rockRadiusTop: 5.2,
    rockRadiusBottom: 3.3,
  },

  scenery: {
    count: 10,
    minZ: -34,
    maxZ: -222,
    recycleBehind: 34,
    aheadGapMin: 17,
    aheadGapMax: 27,
    minX: 15.5,
    maxX: 56,
    minY: 7.5,
    maxY: 19,
    minRadius: 2.5,
    maxRadius: 5.6,
    bobHeight: 0.16,
    padCount: 5,
    padMinZ: -60,
    padMaxZ: -230,
    padSizeMin: 2.5,
    padSizeMax: 3.8,
    padMinX: 11,
    padMaxX: 34,
    padMinY: 4.8,
    padMaxY: 13,
  },

  waterfall: {
    /** Track falls end just above the animated ocean swell. */
    trackBottomY: 0.34,
    trackChance: 0.42,
    trackWidthMin: 0.62,
    trackWidthMax: 1.12,
    sceneryWidthMin: 0.7,
    sceneryWidthMax: 1.35,
    sceneryMinHeight: 2.1,
    sceneryMaxHeight: 3.4,
    widthSegments: 8,
    heightSegments: 12,
  },

  vegetation: {
    bankInset: 0.62,
    trackPropCount: 15,
  },

  clouds: {
    count: 10,
    minY: 26,
    maxY: 54,
    driftLimit: 176,
    farCount: 8,
    farZ: -238,
  },

  distant: {
    count: 7,
    minZ: -252,
    maxZ: -330,
    minX: -96,
    maxX: 96,
    minY: 1,
    maxY: 15,
    minScale: 12,
    maxScale: 30,
  },
} as const
