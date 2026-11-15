import { PALETTE } from './Palette.ts'

/**
 * Renderer and camera defaults tuned for a stylised mobile game.
 * Keeping these values in one object makes performance tuning predictable.
 */
export const RENDER_CONFIG = {
  antialias: true,
  maxPixelRatio: 2,
  clearColor: PALETTE.oceanDeep,
  toneMappingExposure: 1.05,

  fogColor: PALETTE.fog,
  fogNear: 58,
  fogFar: 250,

  shadow: {
    mapSize: 2048,
    cameraSize: 34,
    near: 1,
    far: 120,
    bias: -0.0004,
    normalBias: 0.025,
  },
} as const
