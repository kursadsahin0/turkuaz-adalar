import {
  CAMERA_CONFIG,
  type CameraAspectProfile,
  type CameraFraming,
  type CameraSectionBounds,
  type CameraSectionDefinition,
  type CameraSectionFraming,
} from '../../config/CameraConfig.ts'
import { clamp, damp, smoothstep } from '../../utils/math.ts'

export interface CameraFramingValues extends CameraFraming {
  readonly fov: number
}

export interface ResolvedCameraSection {
  readonly section: CameraSectionDefinition
  readonly next: CameraSectionDefinition | null
  /** 0 at the start of the blend window, 1 at the section boundary. */
  readonly blend: number
  readonly framing: CameraSectionFraming
  readonly bounds: CameraSectionBounds
}

const ZERO_BIAS: CameraSectionFraming = {
  distanceBias: 0,
  heightBias: 0,
  lookAheadBias: 0,
  lookHeightBias: 0,
  yawBiasDegrees: 0,
  fovBias: 0,
}

export function resolveAspectProfile(aspect: number): CameraAspectProfile {
  if (aspect < 0.95) {
    return 'portrait'
  }
  if (aspect < 1.35) {
    return 'square'
  }
  return 'landscape'
}

export function baseFraming(profile: CameraAspectProfile): CameraFramingValues {
  return {
    ...CAMERA_CONFIG.aspects[profile],
    fov: CAMERA_CONFIG.projection.fov[profile],
  }
}

export function lerpBias(
  a: CameraSectionFraming,
  b: CameraSectionFraming,
  t: number,
): CameraSectionFraming {
  return {
    distanceBias: a.distanceBias + (b.distanceBias - a.distanceBias) * t,
    heightBias: a.heightBias + (b.heightBias - a.heightBias) * t,
    lookAheadBias: a.lookAheadBias + (b.lookAheadBias - a.lookAheadBias) * t,
    lookHeightBias: a.lookHeightBias + (b.lookHeightBias - a.lookHeightBias) * t,
    yawBiasDegrees: a.yawBiasDegrees + (b.yawBiasDegrees - a.yawBiasDegrees) * t,
    fovBias: a.fovBias + (b.fovBias - a.fovBias) * t,
  }
}

function lerpBounds(
  a: CameraSectionBounds,
  b: CameraSectionBounds,
  t: number,
): CameraSectionBounds {
  return {
    lateral: a.lateral + (b.lateral - a.lateral) * t,
    maxHeight: a.maxHeight + (b.maxHeight - a.maxHeight) * t,
  }
}

/**
 * Resolves the camera section for a travelled distance and blends its framing
 * with the next section over the last `blendDistance` metres. The result is
 * continuous across every boundary: at the exact boundary both branches agree.
 */
export function resolveCameraSection(distance: number): ResolvedCameraSection {
  const definitions = CAMERA_CONFIG.sections.definitions
  const value = Number.isFinite(distance) ? Math.max(0, distance) : 0

  let index = 0
  while (index < definitions.length - 1 && value >= definitions[index].to) {
    index += 1
  }

  const section = definitions[index] ?? definitions[0]
  const next = definitions[index + 1] ?? null
  const blendDistance = Math.max(0.001, CAMERA_CONFIG.sections.blendDistance)
  const blend =
    next && Number.isFinite(section.to)
      ? smoothstep(section.to - blendDistance, section.to, value)
      : 0

  return {
    section,
    next,
    blend,
    framing: next ? lerpBias(section.framing, next.framing, blend) : section.framing,
    bounds: next ? lerpBounds(section.bounds, next.bounds, blend) : section.bounds,
  }
}

/**
 * Combines the viewport base framing with the active section bias and, in the
 * menu, the menu bias. Distance and height are clamped to the global limits so
 * a misconfigured section can never put the camera underground or in orbit.
 */
export function composeFraming(
  base: CameraFramingValues,
  section: ResolvedCameraSection,
  mode: 'menu' | 'follow',
): CameraFramingValues {
  const sectionBias = section.framing
  const menuBias = mode === 'menu' ? CAMERA_CONFIG.menu : ZERO_BIAS
  const bounds = CAMERA_CONFIG.bounds

  return {
    distance: clamp(
      base.distance + sectionBias.distanceBias + menuBias.distanceBias,
      bounds.minDistance,
      bounds.maxDistance,
    ),
    height: clamp(
      base.height + sectionBias.heightBias + menuBias.heightBias,
      bounds.minHeight,
      bounds.maxHeight,
    ),
    lookAhead: Math.max(0.5, base.lookAhead + sectionBias.lookAheadBias + menuBias.lookAheadBias),
    lookHeight: Math.max(0, base.lookHeight + sectionBias.lookHeightBias + menuBias.lookHeightBias),
    yawDegrees: base.yawDegrees + sectionBias.yawBiasDegrees + menuBias.yawBiasDegrees,
    fov: base.fov + sectionBias.fovBias + menuBias.fovBias,
  }
}

export function dampFraming(
  current: CameraFramingValues,
  target: CameraFramingValues,
  lambda: number,
  delta: number,
): CameraFramingValues {
  return {
    distance: damp(current.distance, target.distance, lambda, delta),
    height: damp(current.height, target.height, lambda, delta),
    lookAhead: damp(current.lookAhead, target.lookAhead, lambda, delta),
    lookHeight: damp(current.lookHeight, target.lookHeight, lambda, delta),
    yawDegrees: damp(current.yawDegrees, target.yawDegrees, lambda, delta),
    fov: damp(current.fov, target.fov, lambda, delta),
  }
}
