/**
 * Camera design tokens and framing rules.
 *
 * The rig is an elevated 3/4 (isometric-style) third-person camera: it sits
 * behind and above the runner, looks ahead down the track and keeps the
 * character in the lower half of the frame. `height / distance` defines the
 * downward pitch (~33° by default), while `yawDegrees` adds the small diagonal
 * that makes the world read as a volume instead of a flat corridor.
 *
 * Every value here is data: gameplay code never hard-codes an offset. Sections
 * bias the base framing over the length of a run, so the camera can open up as
 * the track gets faster without a hard cut.
 */

export type CameraMode = 'menu' | 'follow'
export type CameraAspectProfile = 'portrait' | 'square' | 'landscape'

export interface CameraFraming {
  /** Horizontal distance behind the runner, in metres. */
  readonly distance: number
  /** Height above the runner, in metres. */
  readonly height: number
  /** How far down the track the camera looks, in metres. */
  readonly lookAhead: number
  /** Vertical offset of the look target above the runner's centre. */
  readonly lookHeight: number
  /** Diagonal offset from straight-behind, in degrees. */
  readonly yawDegrees: number
}

export interface CameraSectionFraming {
  readonly distanceBias: number
  readonly heightBias: number
  readonly lookAheadBias: number
  readonly lookHeightBias: number
  readonly yawBiasDegrees: number
  readonly fovBias: number
}

export interface CameraSectionBounds {
  /** Maximum lateral offset of the camera pivot from the track centre. */
  readonly lateral: number
  /** Maximum camera height above the track surface. */
  readonly maxHeight: number
}

export interface CameraSectionDefinition {
  readonly id: string
  readonly label: string
  /** Distance where the section begins, in metres along the run. */
  readonly from: number
  /** Distance where the section ends. Use `Infinity` for the final section. */
  readonly to: number
  readonly framing: CameraSectionFraming
  readonly bounds: CameraSectionBounds
}

export const CAMERA_CONFIG = {
  projection: {
    near: 0.1,
    far: 380,
    fov: {
      landscape: 54,
      square: 61,
      portrait: 68,
    } satisfies Record<CameraAspectProfile, number>,
  },

  /** Base framing per viewport shape. */
  aspects: {
    landscape: {
      distance: 10.8,
      height: 7.1,
      lookAhead: 4.6,
      lookHeight: 1.05,
      yawDegrees: 7,
    },
    square: {
      distance: 11.4,
      height: 7.4,
      lookAhead: 4.7,
      lookHeight: 1.08,
      yawDegrees: 6.5,
    },
    portrait: {
      distance: 12.2,
      height: 7.9,
      lookAhead: 5,
      lookHeight: 1.12,
      yawDegrees: 6,
    },
  } satisfies Record<CameraAspectProfile, CameraFraming>,

  /** Menu framing is closer and wider, keeping the idle runner framed. */
  menu: {
    distanceBias: -0.5,
    heightBias: -0.9,
    lookAheadBias: -1.9,
    lookHeightBias: -0.1,
    yawBiasDegrees: 3,
    fovBias: 1.6,
  } satisfies CameraSectionFraming,

  follow: {
    /** Exponential smoothing rates (higher = snappier). */
    positionLambda: 9,
    lookLambda: 11,
    verticalLambda: 6,
    /**
     * Upward target motion (a jump) is absorbed slowly so the runner visibly
     * rises in frame; falling follows at `verticalLambda` to keep the runner
     * in view.
     */
    verticalRiseLambda: 0.8,
    framingLambda: 4.5,
    menuLambda: 2.2,
    /** How much lateral player movement the pivot and look target absorb. */
    pivotXFollow: 0.52,
    lookXFollow: 0.66,
  },

  jump: {
    /** Small extra lift and look rise when a jump starts. */
    rise: 0.45,
    lookRise: 0.12,
    rollDegrees: 0.7,
    decayLambda: 3.4,
  },

  landing: {
    /** Subtle dip on touchdown, scaled by impact speed. */
    dip: 0.2,
    lookDip: 0.08,
    rollDegrees: -0.5,
    recoverLambda: 7,
    minImpactSpeed: 3,
    referenceImpactSpeed: 14,
  },

  rotation: {
    /** Slow ambient drift keeps the isometric view alive. */
    gameplayYawDegrees: 1.3,
    menuYawDegrees: 2.8,
    periodSeconds: 26,
    /** Gentle yaw toward the player's side of the track. */
    steerYawDegrees: 1.8,
    steerLambda: 2.5,
  },

  sections: {
    /** Metres before a boundary over which framing blends between sections. */
    blendDistance: 26,
    definitions: [
      {
        id: 'shallows',
        label: 'Turkuaz Shallows',
        from: 0,
        to: 170,
        framing: {
          distanceBias: 0,
          heightBias: 0,
          lookAheadBias: 0,
          lookHeightBias: 0,
          yawBiasDegrees: 0,
          fovBias: 0,
        },
        bounds: { lateral: 5, maxHeight: 12 },
      },
      {
        id: 'coral-reach',
        label: 'Coral Reach',
        from: 170,
        to: 390,
        framing: {
          distanceBias: 0.6,
          heightBias: 0.4,
          lookAheadBias: 0.35,
          lookHeightBias: 0.04,
          yawBiasDegrees: 2,
          fovBias: 1,
        },
        bounds: { lateral: 4.4, maxHeight: 13 },
      },
      {
        id: 'horizon-run',
        label: 'Horizon Run',
        from: 390,
        to: Number.POSITIVE_INFINITY,
        framing: {
          distanceBias: 1.2,
          heightBias: 0.8,
          lookAheadBias: 0.7,
          lookHeightBias: 0.08,
          yawBiasDegrees: -1.5,
          fovBias: 2,
        },
        bounds: { lateral: 3.8, maxHeight: 14 },
      },
    ] satisfies readonly CameraSectionDefinition[],
  },

  bounds: {
    /** Camera never drops closer than this above the track surface. */
    floorClearance: 0.9,
    /** Extra lateral room outside the section pivot bound. */
    cameraLateralPadding: 1.4,
    minDistance: 6.5,
    maxDistance: 15,
    minHeight: 3.2,
    maxHeight: 15,
    lookFloorClearance: 0.35,
  },

  occlusion: {
    /** Keep this much space between the camera and a blocking surface. */
    clearance: 0.5,
    minimumDistance: 2.5,
    boxPadding: 0.1,
  },

  /** Jump/land offsets and ambient rotation scale down for reduced motion. */
  reducedMotionScale: 0.35,
} as const

export type CameraConfig = typeof CAMERA_CONFIG
