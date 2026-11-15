import * as THREE from 'three'

export type QualityLevel = 'low' | 'medium' | 'high'

export interface QualitySettings {
  level: QualityLevel
  antialias: boolean
  /** Sharpest pixel ratio this tier may reach (auto quality climbs towards it). */
  maxPixelRatio: number
  /** Pixel ratio auto quality starts from before measuring the frame rate. */
  startPixelRatio: number
  shadowMapSize: number
  shadowMapType: THREE.ShadowMapType
  shadowsEnabled: boolean
  fogEnabled: boolean
  particleMultiplier: number
  objectPooling: boolean
  instancing: boolean
  geometryDetail: number
  textureCompression: boolean
}

/**
 * Quality presets for different performance levels.
 * Low: Optimized for older mobile devices
 * Medium: Balanced for mid-range devices (default)
 * High: Maximum quality for flagship devices
 */
export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    antialias: false,
    maxPixelRatio: 2,
    startPixelRatio: 1.5,
    shadowMapSize: 1024,
    // PCF keeps shadow edges smooth; Basic was visibly blocky on phones.
    shadowMapType: THREE.PCFShadowMap,
    shadowsEnabled: true,
    fogEnabled: true,
    particleMultiplier: 0.4,
    objectPooling: true,
    instancing: true,
    geometryDetail: 0.5,
    textureCompression: true,
  },
  medium: {
    level: 'medium',
    antialias: true,
    maxPixelRatio: 2,
    startPixelRatio: 1.75,
    shadowMapSize: 1536,
    shadowMapType: THREE.PCFShadowMap,
    shadowsEnabled: true,
    fogEnabled: true,
    particleMultiplier: 0.7,
    objectPooling: true,
    instancing: true,
    geometryDetail: 0.75,
    textureCompression: true,
  },
  high: {
    level: 'high',
    antialias: true,
    maxPixelRatio: 2.5,
    startPixelRatio: 2,
    shadowMapSize: 2048,
    shadowMapType: THREE.PCFSoftShadowMap,
    shadowsEnabled: true,
    fogEnabled: true,
    particleMultiplier: 1.0,
    objectPooling: true,
    instancing: true,
    geometryDetail: 1.0,
    textureCompression: false,
  },
}

/**
 * Auto-detects the appropriate quality level based on device capabilities.
 */
export function detectQualityLevel(): QualityLevel {
  // Check for mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )

  // Check device memory (if available)
  // Chromium-only (Device Memory API); assume 4 GB elsewhere.
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4

  // Check GPU capabilities via WebGL context
  let isLowEnd = false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl && 'getExtension' in gl) {
      const webglGl = gl as WebGLRenderingContext
      const debugInfo = webglGl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = webglGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        // Check for known low-end GPUs
        if (renderer.includes('Adreno') && !renderer.includes('630') && !renderer.includes('640')) {
          isLowEnd = true
        }
        if (renderer.includes('Mali') && !renderer.includes('G7') && !renderer.includes('G7')) {
          isLowEnd = true
        }
        if (renderer.includes('PowerVR') && !renderer.includes('GX')) {
          isLowEnd = true
        }
      }
    }
  } catch {
    // Fall back to memory check
  }

  // Decision logic
  if (isMobile && (deviceMemory < 3 || isLowEnd)) {
    return 'low'
  }

  if (isMobile && deviceMemory < 6) {
    return 'medium'
  }

  if (!isMobile && deviceMemory < 4) {
    return 'medium'
  }

  return 'high'
}

/**
 * Gets the quality settings for a given level.
 */
export function getQualitySettings(level: QualityLevel): QualitySettings {
  return QUALITY_PRESETS[level]
}

/**
 * Applies quality settings to a WebGL renderer.
 */
export function applyQualitySettings(
  renderer: THREE.WebGLRenderer,
  settings: QualitySettings,
): void {
  // Antialias
  renderer.info.autoReset = false

  // Shadow settings
  renderer.shadowMap.enabled = settings.shadowsEnabled
  renderer.shadowMap.type = settings.shadowMapType

  // Log the applied settings
  if (import.meta.env.DEV)
    console.info(`[Quality] Applied ${settings.level} quality settings:`, {
      antialias: settings.antialias,
      maxPixelRatio: settings.maxPixelRatio,
      shadowMapSize: settings.shadowMapSize,
      particleMultiplier: settings.particleMultiplier,
    })
}
